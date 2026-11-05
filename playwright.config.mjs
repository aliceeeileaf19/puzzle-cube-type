import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, timeout: 45000,
  use: { baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:8770', viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', screenshot: 'only-on-failure' },
  webServer: process.env.TEST_BASE_URL ? undefined : { command: 'python3 -m http.server 8770 --bind 127.0.0.1', url: 'http://127.0.0.1:8770' },
});
