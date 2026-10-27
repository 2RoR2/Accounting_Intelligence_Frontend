import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: ['human-review-live.spec.ts', 'human-review-viewer.spec.ts'],
  outputDir: './test-results/human-review',
  workers: 1,
  timeout: 180000,
  reporter: 'list',
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3002', channel: 'chrome', headless: true, viewport: { width: 1366, height: 768 } },
});
