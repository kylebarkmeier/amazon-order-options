import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  delete globalThis.browser;
  delete globalThis.chrome;
  vi.resetModules();
});

describe('background script', () => {
  it('registers an install listener when a runtime exists', async () => {
    const addListener = vi.fn();
    globalThis.chrome = { runtime: { onInstalled: { addListener } } };
    await import('../../src/background/background.js');
    expect(addListener).toHaveBeenCalledTimes(1);
    expect(() => addListener.mock.calls[0][0]()).not.toThrow();
  });

  it('prefers the browser namespace and tolerates a missing runtime', async () => {
    const addListener = vi.fn();
    globalThis.browser = { runtime: { onInstalled: { addListener } } };
    globalThis.chrome = { runtime: { onInstalled: { addListener: vi.fn() } } };
    await import('../../src/background/background.js');
    expect(addListener).toHaveBeenCalledTimes(1);

    vi.resetModules();
    delete globalThis.browser;
    globalThis.chrome = { runtime: {} };
    await expect(import('../../src/background/background.js')).resolves.toBeDefined();
  });
});
