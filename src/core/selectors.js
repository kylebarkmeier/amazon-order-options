/**
 * Selectors shared by the page scanner and the order-page parser, kept in a
 * leaf module so both can import them without a cycle.
 */

export const BADGE_CLASS = 'aoo-badge';

/** Containers that hold navigation, recommendations, the cart rail or hidden copies of content. */
export const EXCLUDED_SELECTOR = [
  'header',
  'footer',
  'nav',
  '[role="navigation"]',
  '#nav-belt',
  '#navbar',
  '#nav-main',
  '#navFooter',
  '.ewc-content',
  '#ewc',
  '#rhf',
  '#rhf-container',
  '[data-a-carousel-options]',
  '.a-carousel-container',
  '.a-carousel',
  '#rufus-plus-button-menu-items-container',
  '[cel_widget_id*="recommend"]',
  '[cel_widget_id*="buy-again"]',
  '[cel_widget_id*="similarities"]',
  '[data-component="buyAgain"]',
  '.a-popover-preload',
  '#items-summary-section',
  '#cart-items-images-v2',
  `.${BADGE_CLASS}`,
].join(', ');

/** Elements whose contents are not visible: hidden detail copies, offscreen text. */
export const HIDDEN_SELECTOR = '.a-popover-preload, .aok-hidden, [hidden], .a-offscreen';

/** Links that point at a product page; keep in step with ASIN_IN_PATH in page-detector.js. */
export const PRODUCT_LINK_SELECTOR = 'a[href*="/dp/"], a[href*="/gp/product/"], a[href*="/gp/aw/d/"]';
