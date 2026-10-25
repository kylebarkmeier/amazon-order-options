# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Two sizes of the same colour in one order no longer get the first item's
  size on return pages: items are matched by Amazon's line item id, and an
  ambiguous image match is left alone instead of guessed.
- Settings and the cache now work on Firefox and in userscript managers,
  which expose their APIs on the script's own scope rather than the page
  window.
- Return and orders pages under a language prefix such as `/-/en/` are
  recognised.
- Titles containing a colon ("Spider-Man: No Way Home") are no longer dropped
  on return pages.
- On non-English marketplaces, order metadata rows are no longer shown as
  options; only Amazon's variation labels are accepted, in every supported
  language.
- A sign-in page, bot check or redirect served with status 200 is no longer
  remembered as "no variation" for a week.
- Truncated titles are restored for every item whose full title is known,
  including items that already had a size on the page and items without
  variations.
- Items whose lookups failed for a transient reason are retried; items whose
  badge Amazon re-rendered away are badged again; items added while a scan
  was running are no longer missed.
- The badge is never placed inside a link or as an extra table cell, and dark
  colours follow the page background rather than the operating system.
- "Sizes 6-12" in a title no longer yields "Size: s".
- Lazy-loaded images with a placeholder `src` are recognised.
- The options page serialises saves and reports a failed write.
- The release workflow no longer uses the `secrets` context in a step
  condition, which GitHub rejects.

### Changed

- Product pages are requested without session cookies first, so lookups do
  not appear in the account's browsing history.
- Product and order caches are keyed per marketplace.
- Product-page fetches run at most three at a time.
- `host_permissions` was removed from the manifest; the content script's
  same-origin fetch does not need it.

- Firefox 140 or newer is required (142 on Android), because the manifest
  declares that the extension collects no data, which older versions do not
  understand.
- Release assets now come with SHA-256 checksums and signed build provenance
  attestations.

## [1.0.0] - 2026-10-25

### Added

- Chrome and Firefox extensions (Manifest V3) that show the size, colour and
  other selected options under each item on the orders list, order details,
  return cart, return status and Your Returns pages.
- Tampermonkey userscript build of the same code.
- Options page: choose which pages get badges, whether product and order pages
  may be fetched, title heuristics, title expansion, and badge style.
- Hidden "Details" blocks on return pages are read in place, with no network
  requests.
- Product page lookup by ASIN for items whose order page links to the exact
  variation, cached for seven days.
- Order page lookup for return pages that only show an image and a truncated
  title, matched by Amazon's image id.
- Truncated titles are replaced with the full title when it is known.
