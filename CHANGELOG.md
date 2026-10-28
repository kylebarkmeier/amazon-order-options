# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-10-26

First release.

### Added

- Chrome and Firefox extensions (Manifest V3) that show the size, colour and
  other selected options under each item on the orders list, order details,
  return cart, return status and Your Returns pages, on every Amazon retail
  marketplace. Firefox 140 or newer on desktop, 142 or newer on Android.
- Tampermonkey, Violentmonkey and Greasemonkey build of the same code, with
  update metadata pointing at the latest release.
- Options page, also used as the toolbar popup: choose which pages get
  badges, whether product and order pages may be fetched, title heuristics,
  title expansion, and badge style. The dark variant follows the page
  background rather than the operating system.
- Hidden "Details" blocks on return pages are read in place, with no network
  requests. Only Amazon's own variation labels are accepted, in the languages
  of every supported marketplace, so order metadata never turns into a badge.
- Order page lookup for return pages that show only an image and a truncated
  title. Items are matched by Amazon's line item id, which tells apart two
  sizes of one colour that share a product image; an ambiguous image match is
  left alone rather than guessed. Cached one day per marketplace.
- Product page lookup by ASIN, reading the variation data Amazon embeds in
  the page. The request is made without session cookies first, so lookups do
  not appear in the account's browsing history. Only real product pages are
  cached (seven days per marketplace); a sign-in page, bot check or redirect
  to another product is never remembered as "no variation".
- Truncated titles are replaced with the full title whenever it is known,
  including for items that already show a size and items without variations.
- Lookups that fail for a transient reason are retried, badges that Amazon
  re-renders away are placed again, and items added while a scan is running
  are picked up. Product page fetches run at most three at a time.
- Release assets ship with SHA-256 checksums and signed build provenance
  attestations.
