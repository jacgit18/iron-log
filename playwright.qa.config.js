import { defineConfig, devices } from '@playwright/test';

// The nightly QA scenario smoke run (brief: qa-nightly-smoke): the same real stack as playwright.accounts.config.js, but the people are the seeded QA test accounts (server/qa/personas.ts), so a scenario's steps run against the data its account starts with. A copy of the accounts config on its own port and folders. Original comment: end-to-end tests of signing in, with nothing mocked: the PRODUCTION build of the app served by the real API on one origin, a real
// Postgres, and Better Auth's test-only email sign-in standing in for Google (the Google redirect cannot be automated). The app
// build sends no dev header, so everything here rides on the real session cookie. Run it with `npm run e2e:qa`, which prepares
// the scratch database and the restricted login and passes them in.
const db = process.env.E2E_DATABASE_URL;
const appDb = process.env.E2E_APP_DATABASE_URL;
if (!db || !appDb) throw new Error('E2E_DATABASE_URL and E2E_APP_DATABASE_URL are not set. Run `npm run e2e:qa`, which creates the scratch database and the restricted login for these tests.');
for (const u of [db, appDb]) {
  const host = new URL(u).hostname;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) throw new Error(`Refusing to run the account tests against ${host}: use a local Postgres.`);
}

const ORIGIN = 'http://127.0.0.1:3103';

export default defineConfig({
  testDir: 'e2e-qa',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000, // a scenario may wait for the sign-in limit (10 a minute, see e2e-qa/persona.js)
  reporter: process.env.CI ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-qa' }], ['json', { outputFile: 'test-results-qa/results.json' }]] : 'list',
  outputDir: 'test-results-qa',
  use: { baseURL: ORIGIN, serviceWorkers: 'block', timezoneId: 'America/New_York', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    // NODE_ENV=test is for the server only (the least that lets the test-only sign-in start): the build must stay a production one,
    // or it would send the dev header like a development build.
    command: 'npm run build && env NODE_ENV=test npx tsx server/index.ts',
    url: `${ORIGIN}/api/health/db`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: '3103',
      BASE_URL: ORIGIN,
      BETTER_AUTH_SECRET: 'e2e-only-secret-e2e-only-secret-e2e-only-secret',
      GOOGLE_CLIENT_ID: 'e2e-client.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'e2e-client-secret',
      AUTH_TEST_SIGNIN: 'true',
      APP_DATABASE_URL: appDb,
      DATABASE_URL: db,
      STATIC_DIR: 'dist',
    },
  },
});
