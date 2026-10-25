import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { initOptions } from '../../src/options/options.js';
import { createMemoryStore } from '../../src/core/cache.js';
import { SETTINGS_KEY } from '../../src/core/settings.js';

const html = readFileSync(path.resolve('src/options/options.html'), 'utf8');

async function setup(initial) {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const store = createMemoryStore();
  if (initial) await store.set(SETTINGS_KEY, JSON.stringify(initial));
  await initOptions(dom.window.document, store);
  return { dom, doc: dom.window.document, store };
}

describe('options page', () => {
  it('reflects stored settings in the form', async () => {
    const { doc } = await setup({ showOnOrders: false, badgeStyle: 'plain' });
    expect(doc.getElementById('settings').dataset.ready).toBe('true');
    expect(doc.querySelector('[name="showOnOrders"]').checked).toBe(false);
    expect(doc.querySelector('[name="showOnReturns"]').checked).toBe(true);
    expect(doc.querySelector('[name="badgeStyle"]').value).toBe('plain');
  });

  it('saves changes and shows a status message', async () => {
    vi.useFakeTimers();
    const { doc, dom, store } = await setup();
    const checkbox = doc.querySelector('[name="expandTitles"]');
    checkbox.checked = false;
    checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await vi.waitFor(async () => {
      expect(JSON.parse(await store.get(SETTINGS_KEY)).expandTitles).toBe(false);
    });
    expect(doc.getElementById('status').textContent).toBe('Saved.');

    const select = doc.querySelector('[name="badgeStyle"]');
    select.value = 'plain';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await vi.waitFor(async () => {
      expect(JSON.parse(await store.get(SETTINGS_KEY)).badgeStyle).toBe('plain');
    });

    await vi.advanceTimersByTimeAsync(1600);
    expect(doc.getElementById('status').textContent).toBe('');
    vi.useRealTimers();
  });

  it('ignores change events from unrelated fields', async () => {
    const { doc, dom, store } = await setup();
    const stray = doc.createElement('input');
    stray.name = 'unrelated';
    doc.getElementById('settings').appendChild(stray);
    stray.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(await store.get(SETTINGS_KEY)).toBeNull();
  });
});
