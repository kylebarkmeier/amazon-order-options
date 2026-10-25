import { test as base, chromium, expect } from '@playwright/test';
import { CHROME_EXTENSION_PATH, routeAmazon } from './helpers.js';

/**
 * Playwright fixtures that launch Chromium with the built extension loaded.
 * Each test gets its own persistent context, so extension storage starts empty.
 *
 * Extensions need a full browser, not the headless shell. CI uses Playwright's
 * bundled Chromium. Set PW_EXTENSION_CHANNEL=chrome to use an installed Google
 * Chrome instead, for example on a machine where the bundled build cannot start.
 */
const channel = process.env.PW_EXTENSION_CHANNEL || 'chromium';

export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel,
      args: [`--disable-extensions-except=${CHROME_EXTENSION_PATH}`, `--load-extension=${CHROME_EXTENSION_PATH}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(worker.url().split('/')[2]);
  },
  requestLog: async ({ context }, use) => {
    const log = await routeAmazon(context);
    await use(log);
  },
  page: async ({ context, requestLog }, use) => {
    void requestLog;
    const page = await context.newPage();
    await use(page);
    await page.close();
  },
});

export { expect };
