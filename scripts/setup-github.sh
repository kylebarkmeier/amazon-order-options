#!/usr/bin/env bash
# Applies the repository's security settings on GitHub. Run once after the
# repository exists, and again any time you want to re-assert the settings:
#
#   scripts/setup-github.sh owner/repo
#
# Needs the GitHub CLI (`gh`) authenticated as an admin of the repository.
# Everything here is idempotent. Settings that need a human (account 2FA,
# commit-signing keys, store credentials) are listed in docs/github-security.md.
#
# Environment knobs:
#   REQUIRE_REVIEWS=1          require one approving code-owner review on main (default 1)
#   REQUIRE_SIGNED_COMMITS=1   reject unsigned commits and tags (default 1)
#   RELEASE_REVIEWER=<login>   who must approve release runs (default: the authenticated user)
set -euo pipefail

REPO="${1:?usage: $0 owner/repo}"
OWNER="${REPO%%/*}"
REQUIRE_REVIEWS="${REQUIRE_REVIEWS:-1}"
REQUIRE_SIGNED_COMMITS="${REQUIRE_SIGNED_COMMITS:-1}"
RELEASE_REVIEWER="${RELEASE_REVIEWER:-$(gh api user --jq .login)}"

api() {
  # api METHOD PATH [extra gh args...]; reads a JSON body from stdin when given.
  local method="$1" path="$2"
  shift 2
  gh api --method "$method" "repos/$REPO$path" "$@"
}

step() { printf '\n== %s\n' "$*"; }
try() {
  # Some settings only exist on public repositories or paid plans. Report and continue.
  if ! "$@" >/dev/null; then
    printf '   (skipped: not available for this repository or plan)\n'
  fi
}

step "repository settings: squash-only merges, branch cleanup, no wiki or projects"
api PATCH "" --input - <<'EOF' >/dev/null
{
  "allow_squash_merge": true,
  "allow_merge_commit": false,
  "allow_rebase_merge": false,
  "allow_auto_merge": true,
  "allow_update_branch": true,
  "delete_branch_on_merge": true,
  "squash_merge_commit_title": "PR_TITLE",
  "squash_merge_commit_message": "PR_BODY",
  "has_wiki": false,
  "has_projects": false,
  "has_discussions": true,
  "web_commit_signoff_required": false
}
EOF

step "secret scanning, push protection, Dependabot security updates"
try api PATCH "" --input - <<'EOF'
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" },
    "secret_scanning_ai_detection": { "status": "enabled" },
    "dependabot_security_updates": { "status": "enabled" }
  }
}
EOF

step "Dependabot alerts, automated security fixes, private vulnerability reporting"
try api PUT /vulnerability-alerts
try api PUT /automated-security-fixes
try api PUT /private-vulnerability-reporting

step "Actions: only GitHub-owned actions plus the pinned Scorecard action"
api PUT /actions/permissions --input - <<'EOF' >/dev/null
{ "enabled": true, "allowed_actions": "selected" }
EOF
api PUT /actions/permissions/selected-actions --input - <<'EOF' >/dev/null
{
  "github_owned_allowed": true,
  "verified_allowed": false,
  "patterns_allowed": ["ossf/scorecard-action@*"]
}
EOF

step "Actions: read-only default token, no PR approvals by workflows"
api PUT /actions/permissions/workflow --input - <<'EOF' >/dev/null
{ "default_workflow_permissions": "read", "can_approve_pull_request_reviews": false }
EOF

step "Actions: require approval before workflows run for any outside contributor"
try api PUT /actions/permissions/fork-pr-contributor-approval --input - <<'EOF'
{ "approval_policy": "all_external_contributors" }
EOF

step "release environment: tag-only deployments that wait for $RELEASE_REVIEWER"
REVIEWER_ID=$(gh api "users/$RELEASE_REVIEWER" --jq .id)
try api PUT /environments/release --input - <<EOF
{
  "reviewers": [{ "type": "User", "id": $REVIEWER_ID }],
  "prevent_self_review": false,
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
}
EOF
if ! api GET /environments/release/deployment-branch-policies --jq '.branch_policies[].name' 2>/dev/null | grep -qx 'v\*'; then
  try api POST /environments/release/deployment-branch-policies --input - <<'EOF'
{ "name": "v*", "type": "tag" }
EOF
fi

step "ruleset for main: pull requests only, required checks, linear history, no deletion"
REVIEW_COUNT=0
CODE_OWNER=false
if [ "$REQUIRE_REVIEWS" = "1" ]; then REVIEW_COUNT=1; CODE_OWNER=true; fi
SIGNATURE_RULE=""
if [ "$REQUIRE_SIGNED_COMMITS" = "1" ]; then SIGNATURE_RULE='{ "type": "required_signatures" },'; fi

MAIN_RULESET=$(cat <<EOF
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    $SIGNATURE_RULE
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": $REVIEW_COUNT,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": $CODE_OWNER,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "CI passed" },
          { "context": "Conventional title" },
          { "context": "Dependency review" },
          { "context": "Changelog updated" },
          { "context": "Analyze (javascript-typescript)" }
        ]
      }
    },
    {
      "type": "code_scanning",
      "parameters": {
        "code_scanning_tools": [
          { "tool": "CodeQL", "security_alerts_threshold": "high_or_higher", "alerts_threshold": "errors" }
        ]
      }
    }
  ]
}
EOF
)

TAG_RULESET=$(cat <<EOF
{
  "name": "release tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }
  ],
  "rules": [
    { "type": "creation" },
    { "type": "update" },
    { "type": "deletion" },
    { "type": "non_fast_forward" }
    $( [ "$REQUIRE_SIGNED_COMMITS" = "1" ] && printf ', { "type": "required_signatures" }' )
  ]
}
EOF
)

upsert_ruleset() {
  local name="$1" body="$2"
  local id
  id=$(api GET /rulesets --jq ".[] | select(.name == \"$name\") | .id" 2>/dev/null || true)
  if [ -n "$id" ]; then
    printf '%s' "$body" | api PUT "/rulesets/$id" --input - >/dev/null
    printf '   updated ruleset "%s" (#%s)\n' "$name" "$id"
  else
    printf '%s' "$body" | api POST /rulesets --input - >/dev/null
    printf '   created ruleset "%s"\n' "$name"
  fi
}
try upsert_ruleset "main" "$MAIN_RULESET"
step "ruleset for release tags: admins only, no rewrites or deletion"
try upsert_ruleset "release tags" "$TAG_RULESET"

step "done"
cat <<EOF
Settings applied to https://github.com/$REPO

Still needs a person (see docs/github-security.md):
  - two-factor authentication on the $OWNER account
  - a commit-signing key configured locally and added to GitHub$( [ "$REQUIRE_SIGNED_COMMITS" = "1" ] && printf ' (required: unsigned commits are now rejected on main)' )
  - WEB_EXT_API_KEY / WEB_EXT_API_SECRET secrets if Firefox builds should be signed
$( [ "$REQUIRE_REVIEWS" = "1" ] && printf '  - note: one approving review is required. A single maintainer cannot approve their own PR;\n    use "Merge without waiting for requirements" (admin bypass, PR only) or rerun with REQUIRE_REVIEWS=0.\n' )
EOF
