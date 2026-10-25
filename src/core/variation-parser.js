/**
 * Extracts the selected variation (size, color, style, ...) for an ASIN from an
 * Amazon product page.
 *
 * The product page embeds a "twister" data blob:
 *
 *   P.register('twister-js-init-dpx-data', function() {
 *     var dataToReturn = {
 *       "dimensions" : ["size_name","color_name"],
 *       "dimensionValuesDisplayData" : {"B0XXXXXXXX":["Medium","Green"], ...},
 *       "variationDisplayLabels" : {"size_name":"Size","color_name":"Color"},
 *       "currentAsin" : "B0XXXXXXXX",
 *       ...
 *     };
 *     return dataToReturn;
 *   });
 *
 * The values are plain JSON, so they are pulled out by key with a small
 * balanced scanner rather than evaluating the script.
 */

const DIMENSION_LABELS = Object.freeze({
  size_name: 'Size',
  color_name: 'Color',
  style_name: 'Style',
  pattern_name: 'Pattern',
  fit_type: 'Fit',
  material_type: 'Material',
  flavor_name: 'Flavor',
  scent_name: 'Scent',
  item_package_quantity: 'Package Quantity',
  number_of_items: 'Number of Items',
  unit_count: 'Unit Count',
  team_name: 'Team',
  model_name: 'Model',
  edition: 'Edition',
  format: 'Format',
  configuration: 'Configuration',
  platform_for_display: 'Platform',
  capacity: 'Capacity',
  wattage: 'Wattage',
  voltage: 'Voltage',
  length: 'Length',
  width: 'Width',
  height: 'Height',
  metal_type: 'Metal Type',
  gem_type: 'Gem Type',
  ring_size: 'Ring Size',
  shape: 'Shape',
  finish_type: 'Finish',
  design_name: 'Design',
  hardware_interface: 'Interface',
  connectivity_technology: 'Connectivity',
  service_provider: 'Carrier',
  digital_storage_capacity: 'Storage',
  memory_storage_capacity: 'Memory',
  compatible_devices: 'Compatible Devices',
});

/**
 * Turns a twister dimension key into a readable label.
 *
 * @param {string} key
 * @returns {string}
 */
export function humanizeDimension(key) {
  if (!key) return '';
  if (DIMENSION_LABELS[key]) return DIMENSION_LABELS[key];
  return String(key)
    .replace(/_name$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Finds the JSON value that follows `"key" :` in a script body. Handles
 * objects, arrays, strings, numbers and booleans. Returns null if the key is
 * missing or the value cannot be parsed.
 *
 * @param {string} text
 * @param {string} key
 * @returns {unknown}
 */
export function extractJsonValue(text, key) {
  if (!text) return null;
  const needle = new RegExp(`"${key}"\\s*:\\s*`, 'g');
  let match;
  while ((match = needle.exec(text))) {
    const start = match.index + match[0].length;
    const raw = scanJson(text, start);
    if (raw === null) continue;
    try {
      return JSON.parse(raw);
    } catch {
      // try the next occurrence
    }
  }
  return null;
}

/**
 * Returns the substring of a single JSON value starting at `start`.
 *
 * @param {string} text
 * @param {number} start
 * @returns {string|null}
 */
function scanJson(text, start) {
  const first = text[start];
  if (first === '"') {
    let i = start + 1;
    while (i < text.length) {
      if (text[i] === '\\') i += 2;
      else if (text[i] === '"') return text.slice(start, i + 1);
      else i += 1;
    }
    return null;
  }
  if (first === '{' || first === '[') {
    const open = first;
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (inString) {
        if (ch === '\\') i += 1;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  }
  const scalar = /^(true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(start, start + 64));
  return scalar ? scalar[1] : null;
}

/**
 * @typedef {Object} TwisterData
 * @property {string|null} currentAsin
 * @property {string|null} parentAsin
 * @property {string[]} dimensions ordered dimension keys
 * @property {Record<string,string>} labels dimension key -> display label
 * @property {Record<string,string[]>} valuesByAsin ASIN -> display values in dimension order
 */

/**
 * @param {string} html product page HTML
 * @returns {TwisterData|null}
 */
export function parseTwisterData(html) {
  if (!html || typeof html !== 'string') return null;
  const idx = html.indexOf('"dimensionValuesDisplayData"');
  if (idx < 0) return null;
  // Narrow the search window so unrelated blobs on the page do not interfere.
  const window = html.slice(Math.max(0, idx - 20000), idx + 200000);

  const valuesByAsin = extractJsonValue(window, 'dimensionValuesDisplayData');
  if (!valuesByAsin || typeof valuesByAsin !== 'object' || Array.isArray(valuesByAsin)) return null;

  const labels = extractJsonValue(window, 'variationDisplayLabels') || {};
  let dimensions = extractJsonValue(window, 'dimensions');
  if (!Array.isArray(dimensions)) {
    dimensions = Object.keys(labels);
  }
  const currentAsin = extractJsonValue(window, 'currentAsin');
  const parentAsin = extractJsonValue(window, 'parentAsin');

  const normalized = {};
  for (const [asin, values] of Object.entries(valuesByAsin)) {
    if (Array.isArray(values)) normalized[asin.toUpperCase()] = values.map((v) => String(v).trim());
  }

  return {
    currentAsin: typeof currentAsin === 'string' ? currentAsin.toUpperCase() : null,
    parentAsin: typeof parentAsin === 'string' ? parentAsin.toUpperCase() : null,
    dimensions,
    labels: typeof labels === 'object' && labels ? labels : {},
    valuesByAsin: normalized,
  };
}

/**
 * @typedef {Object} OptionPair
 * @property {string} label e.g. "Size"
 * @property {string} value e.g. "Medium"
 */

/**
 * @param {TwisterData|null} twister
 * @param {string} asin
 * @returns {OptionPair[]|null}
 */
export function variationForAsin(twister, asin) {
  if (!twister || !asin) return null;
  const values = twister.valuesByAsin[String(asin).toUpperCase()];
  if (!values || values.length === 0) return null;
  const pairs = values.map((value, i) => {
    const key = twister.dimensions[i];
    const label = (key && twister.labels[key]) || humanizeDimension(key) || `Option ${i + 1}`;
    return { label: cleanLabel(label), value };
  });
  return pairs.filter((p) => p.value);
}

/**
 * @param {string} label
 * @returns {string}
 */
export function cleanLabel(label) {
  return String(label || '')
    .replace(/\s*:\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fallback for product pages that do not expose twister JSON (some mobile and
 * "inline twister" layouts). Reads the currently selected option from the
 * variation widgets in the DOM.
 *
 * @param {Document|Element} root
 * @returns {OptionPair[]}
 */
export function parseVariationFromDom(root) {
  const pairs = [];
  if (!root || !root.querySelectorAll) return pairs;

  for (const box of root.querySelectorAll('[id^="variation_"]')) {
    const labelEl = box.querySelector('.a-form-label, label');
    const valueEl = box.querySelector('.selection');
    if (!valueEl) continue;
    const value = valueEl.textContent.trim();
    if (!value) continue;
    const key = box.id.replace(/^variation_/, '');
    const label = cleanLabel(labelEl ? labelEl.textContent : '') || humanizeDimension(key);
    pairs.push({ label, value });
  }

  if (pairs.length === 0) {
    for (const el of root.querySelectorAll('[id^="inline-twister-expanded-dimension-text-"]')) {
      const key = el.id.replace(/^inline-twister-expanded-dimension-text-/, '');
      const value = el.textContent.trim();
      if (value) pairs.push({ label: humanizeDimension(key), value });
    }
  }

  return pairs;
}
