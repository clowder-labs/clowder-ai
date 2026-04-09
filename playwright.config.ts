import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3003',
    headless: true,
    screenshot: 'only-on-failure',
  },
  // Don't auto-start servers — they're already running
  webServer: {
    command: 'echo "servers already running"',
    url: 'http://localhost:3003',
    reuseExistingServer: true,
  },
});
