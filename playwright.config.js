import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:8123',
  },
  webServer: {
    command: 'python3 -m http.server 8123',
    url: 'http://127.0.0.1:8123',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
