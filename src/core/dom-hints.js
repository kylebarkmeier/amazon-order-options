import { cleanLabel } from './variation-parser.js';
import { imageIdFromElement } from './image-id.js';
import { isOrderId } from './page-detector.js';
import { BADGE_CLASS } from './selectors.js';
import { collapseWhitespace, dedupeByLabel, labelKey, normalizeTitle } from './text.js';

/**
 * Amazon's return pages often already contain the selected options, but hide
 * them inside a "Details" popover or a collapsed block. These helpers read
 * those "Label: value" pairs so they can be shown next to the item.
 *
 * Only labels Amazon uses for variations are accepted. Unknown labels are
 * dropped rather than guessed at, because the product page, which carries
 * Amazon's own localized labels, is consulted anyway.
 */

/**
 * @typedef {import('./variation-parser.js').OptionPair} OptionPair
 */

/**
 * Labels that describe a variation, in English and in the languages of the
 * marketplaces the extension runs on. Compared case-insensitively after
 * trimming a trailing colon.
 */
export const KNOWN_OPTION_LABELS = new Set(
  [
    // English
    'size', 'color', 'colour', 'style', 'pattern', 'fit', 'fit type', 'material', 'material type', 'flavor', 'flavour',
    'scent', 'package quantity', 'number of items', 'unit count', 'count', 'team', 'team name', 'model', 'model name',
    'edition', 'format', 'configuration', 'platform', 'capacity', 'length', 'width', 'height', 'shape', 'finish',
    'design', 'option', 'variant', 'set', 'bundle', 'pack', 'type', 'band', 'band size', 'cup size', 'waist', 'inseam',
    'neck', 'sleeve', 'shoe size', 'ring size', 'frame', 'lens', 'storage', 'memory', 'carrier', 'connectivity',
    'wattage', 'voltage', 'metal type', 'gem type', 'interface', 'denomination', 'size name', 'color name', 'style name',
    'pattern name', 'flavor name', 'scent name', 'item package quantity', 'digital storage capacity',
    // German
    'größe', 'grösse', 'farbe', 'stil', 'muster', 'passform', 'geschmack', 'duft', 'menge pro packung',
    'anzahl der artikel', 'stückzahl', 'ausführung', 'größenangabe', 'schuhgröße', 'ringgröße', 'kapazität',
    // French
    'taille', 'couleur', 'style', 'motif', 'coupe', 'matière', 'matériau', 'parfum', 'saveur', 'pointure',
    'nombre d\'articles', 'quantité par lot', 'capacité', 'modèle', 'version',
    // Spanish
    'talla', 'tamaño', 'color', 'estilo', 'patrón', 'ajuste', 'material', 'sabor', 'aroma', 'número de artículos',
    'cantidad por paquete', 'capacidad', 'modelo', 'versión', 'número de calzado',
    // Italian
    'taglia', 'colore', 'stile', 'fantasia', 'vestibilità', 'materiale', 'gusto', 'profumo', 'numero di articoli',
    'quantità per confezione', 'capacità', 'modello', 'versione', 'misura',
    // Dutch
    'maat', 'kleur', 'stijl', 'patroon', 'pasvorm', 'materiaal', 'smaak', 'geur', 'aantal items', 'capaciteit',
    // Swedish
    'storlek', 'färg', 'stil', 'mönster', 'passform', 'material', 'smak', 'doft', 'antal artiklar', 'kapacitet',
    // Polish
    'rozmiar', 'kolor', 'styl', 'wzór', 'krój', 'materiał', 'smak', 'zapach', 'liczba sztuk', 'pojemność',
    // Portuguese
    'tamanho', 'cor', 'estilo', 'padrão', 'material', 'sabor', 'aroma', 'número de itens', 'capacidade', 'modelo',
    // Turkish
    'beden', 'renk', 'stil', 'desen', 'kalıp', 'malzeme', 'tat', 'koku', 'adet', 'kapasite', 'boyut', 'model',
    // Japanese
    'サイズ', '色', 'カラー', 'スタイル', '柄', 'パターン', '素材', 'フレーバー', '香り', '容量', 'モデル', '個数',
    // Arabic
    'المقاس', 'مقاس', 'اللون', 'لون', 'النمط', 'الحجم', 'حجم', 'المادة', 'النكهة', 'السعة',
  ].map((s) => s.toLowerCase()),
);

/**
 * Words that mark a label as order metadata rather than an item option, in
 * the marketplace languages. Used by the card scanner to tell "Quantity: 2"
 * rows from product titles that happen to contain a colon.
 */
export const METADATA_LABEL_WORDS =
  /(order|bestell|commande|pedido|ordine|bestelling|zamówien|pedido|sipariş|注文|طلب|sold|verkauft|vendu|vendido|venduto|verkocht|sprzedawca|satıcı|販売|seller|händler|vendeur|vendedor|venditore|quantity|qty|menge|quantité|cantidad|quantità|aantal|ilość|quantidade|miktar|数量|الكمية|price|preis|prix|precio|prezzo|prijs|cena|preço|fiyat|価格|السعر|total|gesamt|totale|totaal|razem|toplam|合計|return|retour|rück|devol|reso|zwrot|iade|返品|ship|liefer|livr|envío|spediz|verzend|wysył|kargo|配送|deliver|zustell|entrega|consegna|bezorg|dostaw|teslim|お届け|arriv|track|sendung|suivi|seguimiento|refund|erstatt|rembours|reembolso|rimborso|terugbetal|zwrot|geri ödeme|返金|status|invoice|rechnung|facture|factura|fattura|payment|zahlung|paiement|pago|pagamento|window|request|cancel|storn|annul|feedback|review|bewert|support|gift|geschenk|cadeau|regalo|subscri|abonn|condition|zustand|rma|asin|sku|reason|grund|motif|motivo|comment|location|ort|drop off|eligible|through)/i;

/**
 * @param {string} label
 * @returns {boolean}
 */
export function isOptionLabel(label) {
  const key = labelKey(label);
  if (!key || key.length > 40) return false;
  return KNOWN_OPTION_LABELS.has(key);
}

/**
 * @param {string} label
 * @returns {boolean}
 */
export function isMetadataLabel(label) {
  const key = labelKey(label);
  return Boolean(key) && METADATA_LABEL_WORDS.test(key);
}

const MONEY = /^(?:[$€£¥₹]|USD|EUR|GBP|CAD|AUD|JPY|SEK|PLN|TRY|AED|SAR|EGP|BRL|MXN)\s*[\d.,]+|[\d.,]+\s*(?:€|£|¥|zł|kr|TL|USD|EUR|GBP)$/i;
const DATE_LIKE = /\b(?:\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{2,4})\b/;

/**
 * Values that can never be a variation: order ids, money, URLs, dates, or
 * something that is itself a label. Bare numbers stay, since many sizes are
 * numbers ("Größe: 42"); the label allow-list keeps quantities out.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isOptionValue(value) {
  const v = collapseWhitespace(value);
  if (!v || v.length > 80) return false;
  if (isOrderId(v) || /^https?:/i.test(v) || /@/.test(v)) return false;
  if (MONEY.test(v) || DATE_LIKE.test(v)) return false;
  if (LABEL_ROW.test(v) || /:\s*$/.test(v)) return false;
  return true;
}

/** Text that is a "Label: value" row of its own. */
const LABEL_ROW = /^[^:\n]{1,40}:\s*\S/;

/**
 * Reads "Label:" / "value" span pairs, and "Label: value" single text nodes,
 * from the subtree. Only known option labels with option-shaped values are kept.
 *
 * @param {Element|Document|null} root
 * @returns {OptionPair[]}
 */
export function extractLabelValuePairs(root) {
  const pairs = [];
  if (!root || !root.querySelectorAll) return pairs;
  const push = (label, value) => {
    const l = cleanLabel(label);
    const v = collapseWhitespace(value);
    if (!isOptionLabel(l) || !isOptionValue(v)) return;
    pairs.push({ label: l, value: v });
  };

  // Leaf elements whose own text is "Label:" followed by a sibling leaf with the value.
  const leaves = [...root.querySelectorAll('span, div, td, dt, dd, b, strong, li, p')].filter(
    (el) => el.children.length === 0 || onlyInlineChildren(el),
  );
  for (const el of leaves) {
    if (el.closest(`.${BADGE_CLASS}`)) continue;
    const text = collapseWhitespace(el.textContent);
    if (!text) continue;

    const inline = /^([^:\n]{1,40}):\s+(.{1,80})$/.exec(text);
    if (inline) {
      push(inline[1], inline[2]);
      continue;
    }

    if (/^[^:\n]{1,40}:$/.test(text)) {
      const next = nextLeafSibling(el);
      if (next) push(text.slice(0, -1), next.textContent);
    }
  }
  return dedupeByLabel(pairs);
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
function onlyInlineChildren(el) {
  for (const child of el.children) {
    if (!/^(B|STRONG|I|EM|SPAN)$/.test(child.tagName) || child.children.length > 0) return false;
  }
  return true;
}

/**
 * The element holding the value for a "Label:" element: the next non-empty
 * sibling on the same line. A line break or another label ends the search.
 *
 * @param {Element} el
 * @returns {Element|null}
 */
function nextLeafSibling(el) {
  let next = el.nextElementSibling;
  while (next && next.tagName !== 'BR' && next.textContent.trim() === '') next = next.nextElementSibling;
  if (next && next.tagName !== 'BR' && next.textContent.trim() && !/:\s*$/.test(next.textContent.trim())) return next;
  // Some layouts put the value in a sibling of the parent row.
  const parentNext = el.parentElement && el.parentElement.nextElementSibling;
  if (parentNext && parentNext.children.length <= 1) {
    const text = collapseWhitespace(parentNext.textContent);
    if (text && !/:\s*$/.test(text) && !LABEL_ROW.test(text)) return parentNext;
  }
  return null;
}

/**
 * Hidden detail blocks that belong to an item card.
 *
 * Blocks inside the card always belong to it. Page-level blocks are matched
 * by Amazon's image id; a block with a different image id never matches. A
 * block without an image is matched by title only when it is the sole match.
 *
 * @param {Element} card
 * @param {{imageId?: string|null, title?: string|null}} probe
 * @returns {Element[]}
 */
export function findHiddenDetailBlocks(card, probe) {
  if (!card) return [];
  const blocks = new Set(card.querySelectorAll('.a-popover-preload, .aok-hidden, [hidden], [id^="single-item-details-content"]'));
  const doc = card.ownerDocument;
  if (!doc) return [...blocks];

  const candidates = [
    ...doc.querySelectorAll('.a-popover-preload[id*="itemDetails"], [id^="single-item-details-content"], [id*="item-details"][class*="hidden"]'),
  ].filter((el) => !card.contains(el));
  const titlePrefix = normalizeTitle(probe.title).slice(0, 25);
  const byTitle = [];

  for (const el of candidates) {
    const imageId = imageIdFromElement(el);
    if (imageId) {
      if (probe.imageId && imageId === probe.imageId) blocks.add(el);
      continue;
    }
    if (titlePrefix.length >= 12 && normalizeTitle(el.textContent).includes(titlePrefix)) byTitle.push(el);
  }
  if (byTitle.length === 1) blocks.add(byTitle[0]);
  return [...blocks];
}

/**
 * Collects option hints for a card from the card itself and its hidden
 * blocks. When several page-level blocks match the card (two sizes of one
 * colour share an image), only the labels on which they all agree are kept.
 *
 * @param {Element} card
 * @param {{imageId?: string|null, title?: string|null}} probe
 * @returns {OptionPair[]}
 */
export function collectHints(card, probe) {
  const own = extractLabelValuePairs(card);
  const outside = findHiddenDetailBlocks(card, probe).filter((block) => !card.contains(block));
  const agreed = agreedPairs(outside.map((block) => extractLabelValuePairs(block)));
  return dedupeByLabel([...own, ...agreed]).sort((a, b) => rank(b) - rank(a));
}

/**
 * Pairs whose label appears in several lists are kept only when every list
 * that has the label gives the same value.
 *
 * @param {OptionPair[][]} lists
 * @returns {OptionPair[]}
 */
export function agreedPairs(lists) {
  const values = new Map();
  const first = new Map();
  for (const list of lists) {
    for (const pair of list) {
      const key = labelKey(pair.label);
      if (!values.has(key)) {
        values.set(key, new Set());
        first.set(key, pair);
      }
      values.get(key).add(pair.value.toLowerCase());
    }
  }
  return [...values.entries()].filter(([, set]) => set.size === 1).map(([key]) => first.get(key));
}

/**
 * @param {OptionPair} pair
 * @returns {number}
 */
function rank(pair) {
  const key = labelKey(pair.label);
  if (/^(size|größe|grösse|taille|talla|tamaño|taglia|maat|storlek|rozmiar|tamanho|beden|サイズ|المقاس|مقاس)$/.test(key)) return 3;
  if (/^(color|farbe|couleur|colore|kleur|färg|kolor|cor|renk|色|カラー|اللون|لون)$/.test(key)) return 2;
  return 1;
}
