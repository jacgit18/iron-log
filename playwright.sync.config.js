import { defineConfig, devices } from '@playwright/test';

// End-to-end tests of syncing through the API with nothing mocked: a real browser with the sync flag on, the real API
// (server/index.ts under tsx, in development mode so the dev sign-in header is accepted, connected as the restricted role so row-level
// security applies) and a real Postgres. Run it with
// `npm run e2e:sync`, which prepares a scratch database and passes it in as E2E_DATABASE_URL. The ordinary `npm run e2e`
// runs the app alone against a built copy and mocks /api where it needs to.
const db = process.env.E2E_DATABASE_URL;
const appDb = process.env.E2E_APP_DATABASE_URL;
if (!db || !appDb) throw new Error('E2E_DATABASE_URL and E2E_APP_DATABASE_URL are not set. Run `npm run e2e:sync`, which creates the scratch database and the restricted login for these tests.');
// A server that is not on this machine is never touched: these tests create users and rows. (.env points at Neon.)
for (const u of [db, appDb]) {
  const host = new URL(u).hostname;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) throw new Error(`Refusing to run the sync tests against ${host}: use a local Postgres.`);
}

const API = 'http://127.0.0.1:3101';
const APP = 'http://127.0.0.1:5174';

export default defineConfig({
  testDir: 'e2e-sync',
  fullyParallel: false,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-sync' }]] : 'list',
  outputDir: 'test-results-sync',
  use: { baseURL: APP, serviceWorkers: 'block', timezoneId: 'America/New_York', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'npx tsx server/index.ts',
      url: `${API}/api/health/db`,
      reuseExistingServer: false,
      timeout: 60_000,
      // The API connects as the restricted role, so row-level security applies to everything these tests do. DATABASE_URL is set to the same
      // scratch database only so nothing can fall back to the developer's .env.
      env: { NODE_ENV: 'development', PORT: '3101', APP_DATABASE_URL: appDb, DATABASE_URL: db, STATIC_DIR: '/nonexistent' },
    },
    {
      command: 'npx vite --port 5174 --host 127.0.0.1 --strictPort',
      url: APP,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_ORIGIN: API },
    },
  ],
});
