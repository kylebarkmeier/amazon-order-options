/**
 * The single list of Amazon retail marketplaces the extension runs on.
 * page-detector.js builds its host check from it and scripts/build.mjs
 * generates the manifest match patterns and the userscript @match lines
 * from it, so adding a marketplace is a one-line change.
 */
export const AMAZON_TLDS = Object.freeze([
  'com',
  'co.uk',
  'ca',
  'de',
  'fr',
  'it',
  'es',
  'nl',
  'se',
  'pl',
  'ie',
  'com.be',
  'co.jp',
  'com.au',
  'in',
  'sg',
  'ae',
  'sa',
  'com.tr',
  'eg',
  'com.mx',
  'com.br',
]);

/** Match patterns for manifest content_scripts and userscript @match lines. */
export const AMAZON_MATCH_PATTERNS = Object.freeze(AMAZON_TLDS.map((tld) => `https://*.amazon.${tld}/*`));
