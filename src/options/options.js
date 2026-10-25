import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../core/settings.js';
import { createPlatformStore } from '../platform/storage.js';

/**
 * Wires the options form to storage. Exported so it can be unit tested with
 * an injected document and store.
 *
 * @param {Document} doc
 * @param {import('../core/cache.js').KeyValueStore} store
 */
export async function initOptions(doc, store) {
  const form = doc.getElementById('settings');
  const status = doc.getElementById('status');
  const settings = await loadSettings(store);

  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const field = form.elements.namedItem(key);
    if (!field) continue;
    if (field.type === 'checkbox') field.checked = Boolean(settings[key]);
    else field.value = String(settings[key]);
  }

  form.dataset.ready = 'true';

  form.addEventListener('change', async (event) => {
    const field = event.target;
    if (!field || !field.name || !(field.name in DEFAULT_SETTINGS)) return;
    const value = field.type === 'checkbox' ? field.checked : field.value;
    await saveSettings(store, { [field.name]: value });
    status.textContent = 'Saved.';
    setTimeout(() => {
      if (status.textContent === 'Saved.') status.textContent = '';
    }, 1500);
  });
}

/* c8 ignore start */
if (typeof document !== 'undefined' && !globalThis.__AOO_NO_AUTOSTART__) {
  initOptions(document, createPlatformStore(globalThis)).catch(() => {});
}
/* c8 ignore stop */
