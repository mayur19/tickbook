import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke tests. They need a seeded development database
 * (`./run.sh setup`) and start the API + web dev servers unless already running.
 * CI does not run them (no browsers are installed there); run locally with
 * `./run.sh e2e` or `npm run test:e2e`.
 */
export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: './report', open: 'never' }]],
  use: { baseURL: 'http://localhost:5106', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    cwd: '..',
    url: 'http://localhost:5106',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
