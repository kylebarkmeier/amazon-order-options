# Security

## What the extension can see

The content script runs only on Amazon retail domains listed in the manifest.
It reads the order and return pages you open, and it may fetch two kinds of
Amazon pages in the background using your existing session:

- the product page for an item (`/dp/<ASIN>`), to read the selected variation
- the order details page for an order id shown on a return page

Both fetches are same-origin requests to Amazon. Nothing is sent anywhere
else. The only data stored is a cache of variation text keyed by ASIN, a cache
of order item lists keyed by order id (one day), and your settings. Everything
is kept in the browser's extension storage (or Tampermonkey storage for the
userscript) and never leaves the device.

Both kinds of fetch can be turned off on the options page.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: open the repository's Security
tab and choose **Report a vulnerability**. Please include the browser, the
page type, and steps to reproduce. Expect an acknowledgement within a week.

Please do not open a public issue for security problems until a fix is
available.

## Verifying a release

Every release asset ships with a `.sha256` file and a signed build provenance
attestation produced by the release workflow:

```bash
sha256sum -c amazon-order-options-chrome-<version>.zip.sha256
gh attestation verify amazon-order-options-chrome-<version>.zip --owner kylebarkmeier
```

If either check fails, do not install the file.

## How the repository is protected

See [docs/github-security.md](docs/github-security.md) for the full list:
SHA-pinned actions with least-privilege tokens, CodeQL, dependency review,
Scorecard, Dependabot, install scripts disabled, a release environment that
waits for a human, and branch rulesets that require signed commits, pull
requests and green checks.
