# Repository security setup

This file lists every security control for the GitHub repository, which ones
are applied automatically, and what a person still has to do.

## What the repository itself enforces

These live in the repository and apply the moment the code is pushed.

| Control | Where |
| --- | --- |
| Every GitHub Action pinned to a full commit SHA, with the version in a comment so Dependabot can bump it | `.github/workflows/*.yml` |
| Workflows start with `permissions: {}` and each job asks for the minimum it needs | `.github/workflows/*.yml` |
| `actions/checkout` runs with `persist-credentials: false`, so no token stays in the checkout | `.github/workflows/*.yml` |
| Shell steps read untrusted values (PR titles, job results) through environment variables, never by inlining `${{ }}` into the script | `.github/workflows/ci.yml`, `pr.yml` |
| CodeQL (security-extended queries) on every push, PR and weekly | `.github/workflows/codeql.yml` |
| Dependency review blocks PRs that add vulnerable (moderate or worse) or copyleft-licensed packages | `.github/workflows/pr.yml` |
| OpenSSF Scorecard runs weekly and reports to the Security tab | `.github/workflows/scorecard.yml` |
| Dependabot keeps npm packages and action SHAs current, weekly | `.github/dependabot.yml` |
| Releases run in the `release` environment, write SHA-256 checksums and attach signed SLSA build provenance for every asset | `.github/workflows/release.yml` |
| `npm ci` with a lockfile and `ignore-scripts=true`, so no package can run code at install time | `.npmrc`, `package-lock.json` |
| No runtime dependencies at all; the shipped extension is only the code in `src/` | `package.json` |
| CodeRabbit reviews every pull request, requests changes until its comments are resolved, then approves; that approval is the review the ruleset requires | `.coderabbit.yaml` |
| The maintainer is requested as reviewer on every change | `.github/CODEOWNERS` |
| Vulnerability reporting instructions and the data-handling statement | `SECURITY.md` |

## What `scripts/setup-github.sh` applies through the API

Run it once after creating the repository, with `gh` logged in as the owner:

```bash
scripts/setup-github.sh kylebarkmeier/amazon-order-options
```

It is safe to run again later; every call is idempotent.

- **Merging**: squash only, branches deleted after merge, auto-merge allowed,
  "update branch" allowed, wiki and projects off.
- **Code security**: secret scanning, push protection (blocks pushes that
  contain credentials), Dependabot alerts, Dependabot security updates,
  private vulnerability reporting.
- **Actions**: only GitHub-owned actions plus the pinned Scorecard action may
  run; the default `GITHUB_TOKEN` is read-only; workflows cannot approve pull
  requests; workflows from any outside contributor wait for your approval.
- **`release` environment**: only `v*` tags may deploy, and the run pauses
  until you approve it in the Actions tab. A leaked token or a mistaken tag
  cannot publish a release on its own.
- **Ruleset `main`**: no direct pushes, no force pushes, no deletion, linear
  history, signed commits, pull requests only with squash merges, one
  approving review (CodeRabbit gives it once its comments are resolved),
  review threads resolved, and these checks green and up to date with `main`:
  *CI passed*, *Conventional title*, *Dependency review*, *Changelog
  updated*, *Analyze (javascript-typescript)*. New high-severity CodeQL
  alerts block the merge. Admins may bypass, but only through a pull request.
- **Ruleset `release tags`**: `v*` tags can only be created by admins and can
  never be moved or deleted.

Knobs: `REQUIRE_REVIEWS=0` drops the one-approval requirement,
`REQUIRE_CODE_OWNER_REVIEW=1` insists that the review comes from a code owner
(an app such as CodeRabbit never is one, so a single maintainer would then
need the admin bypass on every merge), `REQUIRE_SIGNED_COMMITS=0` drops the
signature rules, `RELEASE_REVIEWER=<login>` changes who approves
releases.

## What only you can do

1. **Two-factor authentication** on your GitHub account, ideally with a
   passkey or security key rather than SMS. Settings, Password and
   authentication.
2. **Commit signing.** The `main` ruleset rejects unsigned commits. The
   quickest setup is SSH signing with a key you already have:

   ```bash
   git config --global gpg.format ssh
   git config --global user.signingkey ~/.ssh/id_ed25519.pub
   git config --global commit.gpgsign true
   git config --global tag.gpgsign true
   ```

   Then add the public key on GitHub as a **Signing Key** (Settings, SSH and
   GPG keys, New SSH key, key type "Signing Key"). Commits made in the GitHub
   web editor are signed automatically. If you would rather not sign, rerun
   the setup script with `REQUIRE_SIGNED_COMMITS=0`.
3. **Install CodeRabbit.** Open <https://github.com/apps/coderabbitai>, choose
   **Install**, and grant it this repository. It reads `.coderabbit.yaml`,
   reviews every pull request on its own, and approves once its comments are
   resolved. Without it, the required review can only come from the admin
   bypass.
4. **Firefox signing secrets** (optional). Create API credentials at
   <https://addons.mozilla.org/developers/addon/api/key/> and add them as
   repository secrets `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET`. Repository
   secrets are only exposed to the `release` environment job, which you
   approve by hand.
5. **Approve each release.** After pushing a `v*` tag, open the Actions tab,
   find the Release run and approve the `release` environment. Nothing is
   published until you do.
6. **Check the Security tab** after the first push: CodeQL and Scorecard
   results appear there, as do Dependabot and secret-scanning alerts.
7. **Keep `gh` and personal tokens tight.** Prefer fine-grained personal
   access tokens scoped to this repository with an expiry; never classic
   tokens with `repo` scope.
8. **Store listings.** When publishing to the Chrome Web Store or AMO, enable
   two-factor authentication on those developer accounts too, and upload the
   exact release assets whose checksums and attestations you can verify:

   ```bash
   gh attestation verify amazon-order-options-chrome-1.0.0.zip --owner kylebarkmeier
   sha256sum -c amazon-order-options-chrome-1.0.0.zip.sha256
   ```

## Plan limits

Rulesets, environment protection, secret scanning and CodeQL are free for
public repositories. On a private repository without GitHub Advanced Security,
the script skips the parts GitHub refuses and says so; branch protection then
needs a paid plan.
