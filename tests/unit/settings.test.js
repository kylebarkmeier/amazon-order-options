import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY, normalizeSettings, loadSettings, saveSettings } from '../../src/core/settings.js';
import { createMemoryStore } from '../../src/core/cache.js';

describe('normalizeSettings', () => {
  it('returns defaults for bad input', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('x')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid overrides and drops invalid ones', () => {
    const result = normalizeSettings({
      showOnOrders: false,
      fetchProductPages: 'yes',
      badgeStyle: 'plain',
      unknown: true,
    });
    expect(result.showOnOrders).toBe(false);
    expect(result.fetchProductPages).toBe(true);
    expect(result.badgeStyle).toBe('plain');
    expect('unknown' in result).toBe(false);
    expect(normalizeSettings({ badgeStyle: 'neon' }).badgeStyle).toBe('highlight');
  });
});

describe('load and save', () => {
  it('round-trips through the store', async () => {
    const store = createMemoryStore();
    expect(await loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    const saved = await saveSettings(store, { expandTitles: false });
    expect(saved.expandTitles).toBe(false);
    expect(saved.showOnReturns).toBe(true);
    expect(JSON.parse(await store.get(SETTINGS_KEY)).expandTitles).toBe(false);
    const again = await saveSettings(store, { badgeStyle: 'plain' });
    expect(again.expandTitles).toBe(false);
    expect(again.badgeStyle).toBe('plain');
  });

  it('falls back to defaults when the store is corrupt or failing', async () => {
    const store = createMemoryStore();
    await store.set(SETTINGS_KEY, '{nope');
    expect(await loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    const failing = {
      get: async () => {
        throw new Error('x');
      },
    };
    expect(await loadSettings(failing)).toEqual(DEFAULT_SETTINGS);
  });
});
