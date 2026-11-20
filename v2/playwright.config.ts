import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  retries: 0,
  timeout: 30000,
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    headless: true
  }
});
