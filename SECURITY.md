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

Open a private security advisory on GitHub
(Security tab, "Report a vulnerability"), or email the maintainer address on the
GitHub profile. Please include the browser, the page type, and steps to
reproduce. Expect an acknowledgement within a week.

Please do not open a public issue for security problems until a fix is
available.
