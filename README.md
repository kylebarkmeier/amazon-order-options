# Amazon Order Options

Shows the size, colour and other options you picked for each item on Amazon's
order and return pages. Available as a Chrome extension, a Firefox extension
(desktop and Android) and a Tampermonkey userscript.

[![CI](https://github.com/kylebarkmeier/amazon-order-options/actions/workflows/ci.yml/badge.svg)](https://github.com/kylebarkmeier/amazon-order-options/actions/workflows/ci.yml)
[![CodeQL](https://github.com/kylebarkmeier/amazon-order-options/actions/workflows/codeql.yml/badge.svg)](https://github.com/kylebarkmeier/amazon-order-options/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/kylebarkmeier/amazon-order-options/badge)](https://scorecard.dev/viewer/?uri=github.com/kylebarkmeier/amazon-order-options)
[![Release](https://img.shields.io/github/v/release/kylebarkmeier/amazon-order-options?display_name=tag)](https://github.com/kylebarkmeier/amazon-order-options/releases/latest)
[![CodeRabbit reviews](https://img.shields.io/coderabbit/prs/github/kylebarkmeier/amazon-order-options?label=CodeRabbit%20reviews)](https://github.com/kylebarkmeier/amazon-order-options/pulls?q=is%3Apr+reviewed-by%3Acoderabbitai)
[![License: MIT](https://img.shields.io/github/license/kylebarkmeier/amazon-order-options)](LICENSE)

Amazon's return flow shows a truncated title and nothing else. If you ordered
the same jacket in two sizes, the return cart gives you two identical rows and
no way to tell which is which. The size is usually in Amazon's own data; it is
just not drawn. This project draws it.

| | |
| --- | --- |
| **Install** | [Latest release](https://github.com/kylebarkmeier/amazon-order-options/releases/latest) for Chrome, Firefox and userscript managers, see [Install](#install) |
| **What changed** | [CHANGELOG.md](CHANGELOG.md) |
| **Something wrong?** | [Report a bug](https://github.com/kylebarkmeier/amazon-order-options/issues/new?template=bug_report.yml) or [request a feature](https://github.com/kylebarkmeier/amazon-order-options/issues/new?template=feature_request.yml) |
| **Security** | [SECURITY.md](SECURITY.md) for what is stored and how to verify a download, [private vulnerability report](https://github.com/kylebarkmeier/amazon-order-options/security/advisories/new) |
| **Contributing** | [CONTRIBUTING.md](CONTRIBUTING.md), [open pull requests](https://github.com/kylebarkmeier/amazon-order-options/pulls) |
| **Build status** | [CI](https://github.com/kylebarkmeier/amazon-order-options/actions/workflows/ci.yml), [CodeQL](https://github.com/kylebarkmeier/amazon-order-options/actions/workflows/codeql.yml), [Scorecard](https://github.com/kylebarkmeier/amazon-order-options/actions/workflows/scorecard.yml), [Releases](https://github.com/kylebarkmeier/amazon-order-options/actions/workflows/release.yml) |

## Contents

- [What it looks like](#what-it-looks-like)
- [Supported pages](#supported-pages)
- [Install](#install)
- [How it works](#how-it-works)
- [Options](#options)
- [Privacy and security](#privacy-and-security)
- [Limitations](#limitations)
- [Development](#development)
- [Releases and verification](#releases-and-verification)
- [License](#license)

## What it looks like

Under every item title on a supported page, a small badge appears:

```
Care Bears Cheer Bear Romper Women's Costume - M
[Size: M] [Color: Pink]
```

On return pages where Amazon cuts the title short, the full title is restored
as well.

## Supported pages

| Page | Path | Where the options come from |
| --- | --- | --- |
| Your Orders | `/gp/css/order-history`, `/your-orders/orders` | Product page for the item's ASIN |
| Order details | `/your-orders/order-details` | Product page for the item's ASIN |
| Return cart (choose items, reason, method) | `/spr/returns/cart` | Hidden "Details" popover on the page, then the order page, then the product page |
| Return status and label | `/spr/returns/prep` and other `/spr/returns/*` | Hidden details block on the page, then the order page and product page |
| Your Returns | `/your-returns` | The page itself, plus the product page |

All amazon retail domains are covered (`.com`, `.co.uk`, `.de`, `.ca`, `.fr`,
`.it`, `.es`, `.co.jp`, `.com.au`, `.in`, `.com.mx`, `.com.br`, `.nl`, `.se`,
`.pl`, `.sg`, `.ae`, `.sa`, `.com.tr`, `.eg`, `.com.be`, `.ie`).

## Install

### Chrome, Edge, Brave and other Chromium browsers

1. Download `amazon-order-options-chrome-<version>.zip` from the
   [latest release](https://github.com/kylebarkmeier/amazon-order-options/releases/latest)
   and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load
   unpacked** and pick the unzipped folder.

Chrome on Android does not run extensions. On Android, use Firefox, or a
Chromium browser that supports extensions (Kiwi, Edge Canary, Yandex), or the
userscript below.

### Firefox (desktop and Android)

Firefox 140 or newer on desktop, 142 or newer on Android.

Releases include a signed `amazon-order-options-firefox-<version>.xpi` when
AMO signing is configured for the repository (see CONTRIBUTING.md), otherwise
a source zip.

- **Signed `.xpi`, desktop:** open the file in Firefox and approve the
  install.
- **Signed `.xpi`, Android:** open Settings, About Firefox, tap the logo five
  times to enable the debug menu, then Settings, **Install extension from
  file**, and pick the downloaded `.xpi`.
- **Zip only, desktop:** open `about:debugging#/runtime/this-firefox`, click
  **Load Temporary Add-on** and pick the zip. The add-on is removed when
  Firefox closes. For a permanent install the zip must be
  [signed through AMO](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

Firefox treats the Amazon host permissions as optional. If no badge appears,
open the extension's entry in the Add-ons manager (or tap the puzzle piece
icon on Android) and allow access to amazon sites.

### Tampermonkey, Violentmonkey, Greasemonkey

Install `amazon-order-options.user.js` from the latest release. The script
carries `@updateURL` metadata, so your userscript manager will pick up new
versions. It works on Firefox for Android with Tampermonkey or Violentmonkey.

### Build it yourself

```bash
npm ci
npm run package
```

`dist/` then contains the Chrome zip, the Firefox zip, the unpacked folders,
and `amazon-order-options.user.js`.

## How it works

For each item card on a supported page the content script combines these
sources:

1. **Hints already on the page.** Return pages often include a "Details"
   popover or a hidden block with `Size:` and `Color:` rows. Only labels
   Amazon uses for variations are accepted, in the languages of all supported
   marketplaces, so order metadata never turns into a badge.
2. **The order page.** Return pages do not link the item's ASIN, but they
   carry Amazon's order line item id in the ids of the "Details" popover and
   in the URL, and the order details page links each item's line item id to
   its ASIN and full title. The order page is fetched once per order (cached
   one day) and the item matched by that id. Two sizes of one colour share a
   product image on Amazon, so when only the image is available and it is
   ambiguous, no guess is made.
3. **The product page.** With the ASIN known, the product page embeds the
   twister data that maps every ASIN in the family to its display values
   (`"B0...": ["M","Pink"]`) along with Amazon's own localized labels. It is
   requested without your session cookies first, so the lookup does not land
   in your browsing history; a signed-in request is the fallback. Cached for
   seven days per marketplace. Pages that are not product pages (a sign-in
   page, a bot check) are never cached, and a page that redirected to another
   product is not trusted for this ASIN.
4. **The title.** If nothing authoritative could be reached and the title ends
   in something like `- M` or `(Small/Medium)`, that is shown and marked
   "(from title)". Once the product page has confirmed an item has no
   variations, nothing is guessed.

Truncated titles are replaced with the full title whenever it is known, from
the order page or from the page's own hidden copy. Items whose lookups failed
for a transient reason are retried a few times. Requests go only to the Amazon
domain you are on, a few at a time, and can be disabled per source on the
options page.

## Options

Click the toolbar icon, or open the extension's options page:

- **Where to show options**: orders pages, return pages
- **How to find options**: product page lookup, order page lookup, title
  heuristics, title expansion
- **Appearance**: highlighted pills or plain text

Settings are stored in extension storage and apply after reloading the Amazon
tab.

The userscript has no options page and runs with the defaults. To change a
setting there, open the script's **Storage** tab in Tampermonkey or
Violentmonkey and edit the `aoo:settings` value, which is the same JSON the
options page writes, for example `{"badgeStyle":"plain","expandTitles":false}`.
Managers without synchronous `GM_getValue` (Greasemonkey 4) fall back to the
page's localStorage for both settings and the cache.

## Privacy and security

No data leaves your browser. There is no telemetry, no external server and no
third-party request. See [SECURITY.md](SECURITY.md) for exactly what is
stored and how to verify a release's checksum and provenance attestation, and
[docs/github-security.md](docs/github-security.md) for how the repository
and its releases are protected.

## Limitations

- Mobile Amazon layouts differ from desktop and change often. Card detection
  is based on what every item has in common (a product image and a title)
  rather than specific class names, but a layout the fixtures do not cover may
  still slip through. Please open an issue with the page type and browser.
- Items that Amazon sells without a variation family (one ASIN, no sizes) get
  no badge, because there is nothing to show.
- Very old orders whose product page has been removed fall back to the title.
- Two sizes of the same colour in one order share a product image. They are
  told apart by Amazon's line item id, which the return cart and status pages
  expose. On a page that exposes neither the id nor the ASIN, the item is left
  without a badge rather than guessed.

## Development

```bash
npm ci
npm run build              # dist/chrome, dist/firefox, dist/userscript
npm run lint
npm run test:unit          # Vitest + jsdom, coverage thresholds enforced
npm run test:e2e:install   # once: Playwright browsers
npm run test:e2e           # Playwright: extension in Chromium, userscript in Chromium/Firefox/WebKit/mobile
```

The end-to-end tests never contact Amazon. Every request to an Amazon host is
answered from `tests/fixtures/pages`, which are hand-written copies of the
page structure with made-up order numbers and ASINs.

Every pull request runs the same checks on GitHub, plus a few that only make
sense there:

| Check | What it does | Workflow |
| --- | --- | --- |
| CI | Lint, unit tests with coverage thresholds, build, packaging, `addons-linter`, icon check, end-to-end tests in Chromium, Firefox and WebKit | [ci.yml](.github/workflows/ci.yml) |
| Pull request checks | Conventional title, dependency review, changelog reminder, size label | [pr.yml](.github/workflows/pr.yml) |
| CodeQL | Static analysis with the security-extended query set, on every push and weekly | [codeql.yml](.github/workflows/codeql.yml) |
| OpenSSF Scorecard | Supply-chain posture, published to the Security tab and the badge above | [scorecard.yml](.github/workflows/scorecard.yml) |
| CodeRabbit | Automated code review on every pull request; its approval is the review the branch rules require | [.coderabbit.yaml](.coderabbit.yaml) |

`main` only accepts squash-merged pull requests with green checks, a review
and signed commits. See [CONTRIBUTING.md](CONTRIBUTING.md) for the project
layout, the PR process and how to add a page, and
[docs/github-security.md](docs/github-security.md) for the full list of
repository controls.

## Releases and verification

Pushing a `v*` tag runs the [release workflow](.github/workflows/release.yml),
which builds every artifact, waits for the maintainer's approval, and
publishes a [GitHub release](https://github.com/kylebarkmeier/amazon-order-options/releases)
with these assets:

| Asset | For |
| --- | --- |
| `amazon-order-options-chrome-<version>.zip` | Chrome, Edge, Brave and other Chromium browsers (Load unpacked) |
| `amazon-order-options-firefox-<version>.zip` | Firefox source zip for AMO or a temporary load |
| `amazon-order-options-firefox-<version>.xpi` | Signed Firefox build for desktop and Android, when AMO signing is configured |
| `amazon-order-options.user.js` | Tampermonkey, Violentmonkey and Greasemonkey; updates itself through the `latest` alias |

Each asset comes with a `.sha256` file and a signed build provenance
attestation, so a download can be checked against what the workflow built:

```bash
sha256sum -c amazon-order-options-chrome-<version>.zip.sha256
gh attestation verify amazon-order-options-chrome-<version>.zip --owner kylebarkmeier
```

## License

[MIT](LICENSE)
