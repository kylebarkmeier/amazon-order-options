# Contributing

## Setup

```bash
npm ci
npm run build
npm run test:e2e:install   # downloads Playwright browsers, once
```

Node 20 or newer is required. The project has no runtime dependencies.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run build` | Builds `dist/chrome`, `dist/firefox` and `dist/userscript` |
| `npm run package` | Builds and zips the extensions for upload |
| `npm run lint` | ESLint over `src`, `scripts` and `tests` |
| `npm run lint:webext` | Mozilla's `addons-linter` over the Firefox build; warnings fail it |
| `npm run test:unit` | Vitest with coverage; thresholds are enforced |
| `npm run test:unit:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright against the built extension and userscript |
| `npm run check` | Everything CI runs, in order |

### Windows note

On some Windows installs the full Chromium and Firefox builds that Playwright
downloads into `%LOCALAPPDATA%\ms-playwright` refuse to start with a
"side-by-side configuration is incorrect" error, while the same files work
from another folder. If you hit that, install the browsers somewhere else:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "C:\tools\pw-browsers"
npx playwright install chromium firefox webkit
npm run test:e2e
```

Google Chrome itself cannot be used for the extension project: Chrome 137
removed the `--load-extension` flag from branded builds. `PW_EXTENSION_CHANNEL`
can still point the extension tests at another Chromium-based channel such as
`chromium` (the default) or `msedge`.

## Project layout

```
manifest/        base manifest plus Chrome- and Firefox-specific overrides
scripts/         build, packaging, icon generation (no third-party zip tooling)
src/core/        pure modules: page detection, parsing, resolution, rendering
src/platform/    storage adapter for extension, Tampermonkey and localStorage
src/content/     the content script entry point (shared by the userscript)
src/options/     options page, also used as the toolbar popup
src/background/  minimal background script
tests/unit/      Vitest + jsdom
tests/e2e/       Playwright; Amazon is never contacted, see fixtures
tests/fixtures/  sanitized copies of Amazon page structure
```

`src/core` has no browser-API dependencies, which is what keeps the unit tests
fast and the same code runnable as a userscript.

Single sources of truth, so a change is made once:

- `src/core/hosts.js`: the marketplace list. The host check, the manifest
  match patterns and the userscript `@match` lines are all generated from it.
- `src/core/selectors.js`: the excluded-container and product-link selectors
  shared by the page scanner and the order-page parser.
- `src/core/text.js`: title normalisation and label de-duplication.
- `tests/fixtures/routes.js`: the URL-to-fixture map used by both the unit
  fetch stub and the Playwright route handler.

## Adding support for a page

1. Open the page in your browser, copy the structure of one item card into a
   new fixture under `tests/fixtures/pages/`, and replace every order number,
   ASIN, image id, line item id, name and address with made-up values. ASINs
   are ten characters; line item ids are lowercase alphanumeric.
2. Teach `src/core/page-detector.js` to classify the URL (paths are compared
   after any `/-/<lang>/` prefix is removed).
3. Check whether `findItemCards` in `src/core/cards.js` already finds the card:
   it looks for the smallest ancestor of a product image that holds a title
   and no second product image. Extend `CARD_SELECTOR` or `findTitle` only if
   that fails.
4. Add a unit test in `tests/unit/cards.test.js`, a rule in
   `tests/fixtures/routes.js`, and a spec in `tests/e2e/`.

## Pull requests

- Branch from `main`. Keep one change per PR.
- Title format is `type(scope): summary`, checked by CI. Types: feat, fix,
  docs, test, ci, build, chore, refactor, perf, revert.
- Add a line under **Unreleased** in `CHANGELOG.md` for anything a user would
  notice. CI reminds you.
- CI must be green and the PR needs one approving review (CODEOWNERS) before
  it merges. Squash merge is used so `main` stays linear.
- Do not commit anything from a real Amazon account: no order numbers, no
  names, no addresses, no full page dumps.

## Branch protection

`main` is governed by a ruleset applied with `scripts/setup-github.sh`:

- pull requests only, squash merges, linear history, signed commits
- no force pushes, no deletions
- required checks: **CI passed**, **Conventional title**, **Dependency
  review**, **Changelog updated**, **Analyze (javascript-typescript)**
- review from a code owner, with all review threads resolved
- no new high-severity CodeQL alerts

`v*` tags are protected too: admins only, never moved or deleted. The full
list of controls, and the steps that need a person, is in
[docs/github-security.md](docs/github-security.md).

## Dependencies

There are no runtime dependencies. Dev dependencies are installed with
`npm ci` and install scripts are disabled by `.npmrc`, so a package cannot run
code on your machine at install time. GitHub Actions are pinned to commit
SHAs; Dependabot opens PRs to move them. When adding a dependency, prefer
none, then one with no transitive dependencies, and expect the dependency
review check to reject anything with a known vulnerability or a copyleft
licence.

## Releasing

1. Update `version` in `package.json` and move the **Unreleased** entries in
   `CHANGELOG.md` under a new version heading with today's date.
2. Open a PR titled `chore(release): vX.Y.Z` and merge it.
3. Tag the merge commit: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. The release workflow checks that the tag matches `package.json`, runs lint
   and unit tests, builds, and publishes a GitHub release with install
   instructions in the body and these assets:
   - `amazon-order-options-chrome-X.Y.Z.zip` (unzip, then Load unpacked)
   - `amazon-order-options-firefox-X.Y.Z.zip` (source zip for AMO or temporary load)
   - `amazon-order-options-firefox-X.Y.Z.xpi` (signed, installable in Firefox desktop and Android; only when signing is configured)
   - `amazon-order-options.user.js` (Tampermonkey; the script's `@updateURL`
     points at the `latest` alias of this asset, so existing installs update
     on their own)
5. Optional store uploads: the Chrome zip can go to the Chrome Web Store and
   the Firefox zip to AMO as a listed add-on.

### Firefox signing

Firefox only installs signed add-ons permanently. To have the release
workflow sign the build, create API credentials at
<https://addons.mozilla.org/developers/addon/api/key/> and add them as
repository secrets named `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET`. The
workflow then submits the build to AMO's unlisted channel and attaches the
signed `.xpi`. Without the secrets the step is skipped and the zip is
published alone.

The add-on id is fixed in `manifest/firefox.json`; do not change it between
releases or Firefox will treat the new build as a different add-on.
