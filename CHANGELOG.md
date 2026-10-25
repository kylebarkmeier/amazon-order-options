# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
