# Amazon Order Options

Shows the size, colour and other options you picked for each item on Amazon's
order and return pages. Available as a Chrome extension, a Firefox extension
(desktop and Android) and a Tampermonkey userscript.

Amazon's return flow shows a truncated title and nothing else. If you ordered
the same jacket in two sizes, the return cart gives you two identical rows and
no way to tell which is which. The size is usually in Amazon's own data; it is
just not drawn. This project draws it.

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

For each item card on a supported page the content script tries, in order:

1. **Hints already on the page.** Return pages often include a "Details"
   popover or a hidden block with `Size:` and `Color:` rows. These are read in
   place and shown under the title. No network request.
2. **The product page.** Order pages link each item to the exact variation's
   ASIN. The product page for that ASIN embeds the twister data that maps every
   ASIN in the family to its display values (`"B0...": ["M","Pink"]`) along with
   labels. One same-origin fetch per ASIN, cached for seven days.
3. **The order page, then the product page.** Return pages do not expose the
   ASIN at all. They do show the order number and the product image. The order
   details page is fetched once per order (cached one day), the item is matched
   by Amazon's image id, and its ASIN is looked up as in step 2.
4. **The title.** If nothing else works and the title ends in something like
   `- M` or `(Small/Medium)`, that is shown and marked "(from title)".

Requests use your existing Amazon session and go only to the Amazon domain you
are on. Fetching can be disabled per source on the options page.

## Options

Click the toolbar icon, or open the extension's options page:

- **Where to show options**: orders pages, return pages
- **How to find options**: product page lookup, order page lookup, title
  heuristics, title expansion
- **Appearance**: highlighted pills or plain text

Settings are stored in extension storage (Tampermonkey storage for the
userscript) and apply after reloading the Amazon tab.

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

See [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout, the PR process
and how to add a page.

## License

[MIT](LICENSE)
