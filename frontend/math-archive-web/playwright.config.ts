import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', workers: 1, fullyParallel: false,
  globalSetup: './e2e/trainer-setup.ts',
  use: { headless: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }
  ]
});
