import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../core/settings.js';
import { createPlatformStore } from '../platform/storage.js';

/**
 * Wires the options form to storage. Exported so it can be unit tested with
 * an injected document and store.
 *
 * Changes are written one after another through a single queue so two quick
 * toggles cannot overwrite each other, and a failed write is shown.
 *
 * @param {Document} doc
 * @param {import('../core/cache.js').KeyValueStore} store
 */
export async function initOptions(doc, store) {
  const form = doc.getElementById('settings');
  const status = doc.getElementById('status');
  let current = await loadSettings(store);

  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const field = form.elements.namedItem(key);
    if (!field) continue;
    if (field.type === 'checkbox') field.checked = Boolean(current[key]);
    else field.value = String(current[key]);
  }

  form.dataset.ready = 'true';

  let queue = Promise.resolve();
  let clearTimer = null;
  const show = (text) => {
    status.textContent = text;
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      if (status.textContent === text) status.textContent = '';
    }, 1500);
  };

  form.addEventListener('change', (event) => {
    const field = event.target;
    if (!field || !field.name || !(field.name in DEFAULT_SETTINGS)) return;
    const value = field.type === 'checkbox' ? field.checked : field.value;
    current = { ...current, [field.name]: value };
    const snapshot = current;
    queue = queue
      .then(() => saveSettings(store, snapshot))
      .then(
        (saved) => {
          current = saved;
          show('Saved.');
        },
        () => {
          show('Could not save. Try again.');
        },
      );
    form.dataset.pending = 'true';
    queue.then(() => {
      delete form.dataset.pending;
    });
  });

  return {
    /** Resolves once every change made so far has been written. */
    flush: () => queue,
  };
}

/* c8 ignore start */
if (typeof document !== 'undefined' && !globalThis.__AOO_NO_AUTOSTART__) {
  initOptions(document, createPlatformStore(globalThis)).catch(() => {});
}
/* c8 ignore stop */
