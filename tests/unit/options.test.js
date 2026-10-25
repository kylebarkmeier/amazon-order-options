import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { initOptions } from '../../src/options/options.js';
import { createMemoryStore } from '../../src/core/cache.js';
import { SETTINGS_KEY } from '../../src/core/settings.js';

const html = readFileSync(path.resolve('src/options/options.html'), 'utf8');

afterEach(() => {
  vi.useRealTimers();
});

async function setup(initial, store = createMemoryStore()) {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  if (initial) await store.set(SETTINGS_KEY, JSON.stringify(initial));
  const api = await initOptions(dom.window.document, store);
  return { dom, doc: dom.window.document, store, api };
}

function change(dom, field, value) {
  const el = dom.window.document.querySelector(`[name="${field}"]`);
  if (el.type === 'checkbox') el.checked = value;
  else el.value = value;
  el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}

describe('options page', () => {
  it('reflects stored settings in the form and marks itself ready', async () => {
    const { doc } = await setup({ showOnOrders: false, badgeStyle: 'plain' });
    expect(doc.getElementById('settings').dataset.ready).toBe('true');
    expect(doc.querySelector('[name="showOnOrders"]').checked).toBe(false);
    expect(doc.querySelector('[name="showOnReturns"]').checked).toBe(true);
    expect(doc.querySelector('[name="badgeStyle"]').value).toBe('plain');
  });

  it('saves changes, shows a status message and clears it', async () => {
    vi.useFakeTimers();
    const { doc, dom, store, api } = await setup();
    change(dom, 'expandTitles', false);
    await api.flush();
    expect(JSON.parse(await store.get(SETTINGS_KEY)).expandTitles).toBe(false);
    expect(doc.getElementById('status').textContent).toBe('Saved.');

    change(dom, 'badgeStyle', 'plain');
    await api.flush();
    expect(JSON.parse(await store.get(SETTINGS_KEY)).badgeStyle).toBe('plain');

    await vi.advanceTimersByTimeAsync(1600);
    expect(doc.getElementById('status').textContent).toBe('');
  });

  it('keeps both of two quick changes even when the store is slow', async () => {
    const slow = createMemoryStore();
    const realGet = slow.get;
    slow.get = async (key) => {
      await new Promise((r) => setTimeout(r, 10));
      return realGet(key);
    };
    const { dom, store, api } = await setup(null, slow);
    change(dom, 'showOnOrders', false);
    change(dom, 'fetchProductPages', false);
    await api.flush();
    const saved = JSON.parse(await store.get(SETTINGS_KEY));
    expect(saved.showOnOrders).toBe(false);
    expect(saved.fetchProductPages).toBe(false);
  });

  it('reports a failed write instead of swallowing it', async () => {
    const broken = createMemoryStore();
    broken.set = async () => {
      throw new Error('QUOTA_BYTES exceeded');
    };
    const { doc, dom, api } = await setup(null, broken);
    change(dom, 'expandTitles', false);
    await api.flush();
    expect(doc.getElementById('status').textContent).toBe('Could not save. Try again.');
    expect(doc.getElementById('settings').dataset.pending).toBeUndefined();
  });

  it('ignores change events from unrelated fields', async () => {
    const { doc, dom, store, api } = await setup();
    const stray = doc.createElement('input');
    stray.name = 'unrelated';
    doc.getElementById('settings').appendChild(stray);
    stray.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await api.flush();
    expect(await store.get(SETTINGS_KEY)).toBeNull();
  });
});
