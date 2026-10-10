import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    viewport: { width: 390, height: 844 },
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ??
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://127.0.0.1:3100/api/health',
    reuseExistingServer: false,
    env: {
      PORT: '3100',
      COACH_PASSWORD: 'e2e-test-password-only',
      COACH_SECURE_COOKIE: 'false',
      COACH_DB_PATH: `test-results/e2e-${Date.now()}.sqlite`,
      COACH_DEMO_MODEL: '1',
    },
    timeout: 60000,
  },
});
