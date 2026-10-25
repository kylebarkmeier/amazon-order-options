import { defineConfig, devices } from '@playwright/test';

/**
 * E2E projects:
 *   chromium-extension  loads dist/chrome as an unpacked extension
 *   userscript-*        injects dist/userscript into Chromium, Firefox and WebKit
 *   userscript-mobile   same, on an emulated Android phone viewport
 *
 * Amazon is never contacted: every amazon.com request is answered from
 * tests/fixtures/pages by a route handler (see tests/e2e/helpers.js).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-extension',
      testMatch: /extension\..*\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'userscript-chromium',
      testMatch: /userscript\..*\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'userscript-firefox',
      testMatch: /userscript\..*\.spec\.js/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'userscript-webkit',
      testMatch: /userscript\..*\.spec\.js/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'userscript-mobile',
      testMatch: /userscript\..*\.spec\.js/,
      use: { ...devices['Pixel 7'] },
    },
  ],
});
