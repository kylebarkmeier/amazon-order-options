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
#   REQUIRE_REVIEWS=1          require one approving review on main (default 1); CodeRabbit
#                              approves once its comments are resolved, so a single
#                              maintainer can satisfy this
#   REQUIRE_CODE_OWNER_REVIEW=0  make that review come from a CODEOWNERS entry (default 0,
#                              because an app such as CodeRabbit is never a code owner)
#   REQUIRE_SIGNED_COMMITS=1   reject unsigned commits and tags (default 1)
#   RELEASE_REVIEWER=<login>   who must approve release runs (default: the authenticated user)
set -euo pipefail
# When PowerShell starts Git Bash directly, the shell's own tools are not on
# PATH. Put bash's directory first so nothing below depends on the caller.
PATH="$(dirname "$BASH"):$PATH"

REPO="${1:?usage: $0 owner/repo}"
OWNER="${REPO%%/*}"
REQUIRE_REVIEWS="${REQUIRE_REVIEWS:-1}"
REQUIRE_CODE_OWNER_REVIEW="${REQUIRE_CODE_OWNER_REVIEW:-0}"
REQUIRE_SIGNED_COMMITS="${REQUIRE_SIGNED_COMMITS:-1}"
RELEASE_REVIEWER="${RELEASE_REVIEWER:-$(gh api user --jq .login)}"

api() {
  # api METHOD PATH [extra gh args...]; reads a JSON body from stdin when given.
  local method="$1" path="$2"
  shift 2
  gh api --method "$method" "repos/$REPO$path" "$@"
}

step() { printf '\n== %s\n' "$*"; }
SKIPPED=()
try() {
  # Some settings only exist on public repositories or paid plans. Report,
  # remember, and continue. Required steps run outside `try` and abort on error.
  if ! "$@" >/dev/null; then
    printf '   (not applied: GitHub refused it, see the message above)\n'
    SKIPPED+=("$*")
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
EXISTING_POLICIES=$(api GET /environments/release/deployment-branch-policies --jq '.branch_policies[].name' 2>/dev/null || true)
case "$EXISTING_POLICIES" in
  *'v*'*) ;;
  *) try api POST /environments/release/deployment-branch-policies --input - <<'EOF'
{ "name": "v*", "type": "tag" }
EOF
  ;;
esac

step "ruleset for main: pull requests only, required checks, linear history, no deletion"
REVIEW_COUNT=0
CODE_OWNER=false
if [ "$REQUIRE_REVIEWS" = "1" ]; then
  REVIEW_COUNT=1
  if [ "$REQUIRE_CODE_OWNER_REVIEW" = "1" ]; then CODE_OWNER=true; fi
fi
SIGNATURE_RULE=""
if [ "$REQUIRE_SIGNED_COMMITS" = "1" ]; then SIGNATURE_RULE='{ "type": "required_signatures" },'; fi

read -r -d '' MAIN_RULESET <<EOF || true
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

read -r -d '' TAG_RULESET <<EOF || true
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

upsert_ruleset() {
  # Returns non-zero when the API refuses the ruleset, so the caller can report it.
  local name="$1" body="$2"
  local id
  id=$(api GET /rulesets --jq ".[] | select(.name == \"$name\") | .id" 2>/dev/null || true)
  if [ -n "$id" ]; then
    if printf '%s' "$body" | api PUT "/rulesets/$id" --input - >/dev/null; then
      printf '   updated ruleset "%s" (#%s)\n' "$name" "$id"
      return 0
    fi
    return 1
  fi
  if printf '%s' "$body" | api POST /rulesets --input - >/dev/null; then
    printf '   created ruleset "%s"\n' "$name"
    return 0
  fi
  return 1
}
if ! upsert_ruleset "main" "$MAIN_RULESET"; then
  printf '   ERROR: the main branch ruleset was not applied. main is unprotected.\n' >&2
  RULESET_FAILED=1
fi
step "ruleset for release tags: admins only, no rewrites or deletion"
if ! upsert_ruleset "release tags" "$TAG_RULESET"; then
  printf '   ERROR: the release tag ruleset was not applied.\n' >&2
  RULESET_FAILED=1
fi

step "done"
if [ "${#SKIPPED[@]}" -gt 0 ]; then
  printf 'Not applied (plan or repository type does not support them):\n'
  for item in "${SKIPPED[@]}"; do printf '  - %s\n' "$item"; done
fi
while IFS= read -r line; do printf '%s\n' "$line"; done <<EOF
Settings applied to https://github.com/$REPO

Still needs a person (see docs/github-security.md):
  - two-factor authentication on the $OWNER account
  - a commit-signing key configured locally and added to GitHub$( [ "$REQUIRE_SIGNED_COMMITS" = "1" ] && printf ' (required: unsigned commits are now rejected on main)' )
  - WEB_EXT_API_KEY / WEB_EXT_API_SECRET secrets if Firefox builds should be signed
$( [ "$REQUIRE_REVIEWS" = "1" ] && printf '  - the CodeRabbit GitHub App (https://github.com/apps/coderabbitai) installed on the repository:\n    its approval is the one review main requires. Without it, or with REQUIRE_CODE_OWNER_REVIEW=1,\n    a single maintainer must use the admin bypass or rerun with REQUIRE_REVIEWS=0.\n' )
EOF
if [ "${RULESET_FAILED:-0}" = "1" ]; then
  printf '\nOne or more rulesets failed to apply. Fix the error above and rerun.\n' >&2
  exit 1
fi
