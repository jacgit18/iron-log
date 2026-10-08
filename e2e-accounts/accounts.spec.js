import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import pg from 'pg';

// Signing in and out for real: the production build, the real API, a real session cookie. See playwright.accounts.config.js.
const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
test.afterAll(() => pool.end());

const NOW = new Date('2026-09-24T18:30:00-04:00'); // a fixed Thursday, as in the other browser tests
const PASSWORD = 'correct horse battery staple';
let counter = 0;
const emailFor = who => `${who}-${Date.now() % 1_000_000}-${counter++}@example.com`;

async function phone(browser, { returning = true } = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'America/New_York', viewport: { width: 1440, height: 900 } });
  await context.addInitScript(returning => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
    // A returning browser has seen a signed-in session, so it goes straight to the app; a stranger gets the landing page. Seeded once, so a sign-out can clear it.
    if (returning && !sessionStorage.getItem('knownSeeded')) { sessionStorage.setItem('knownSeeded', '1'); localStorage.setItem('ironlog:session/known', 'true'); }
  }, returning);
  const page = await context.newPage();
  await page.clock.install({ time: NOW });
  const devHeaders = [];
  page.on('request', r => { if (r.url().includes('/api/') && r.headers()['x-dev-user']) devHeaders.push(r.url()); });
  return { context, page, devHeaders };
}
// Better Auth's test-only email path sets the same session cookie Google sign-in does.
const signUp = async (page, email, name) => {
  const res = await page.request.post('/api/auth/sign-up/email', { data: { email, password: PASSWORD, name } });
  expect(res.status()).toBe(200);
};
const rowsOf = async email => (await pool.query(
  `select count(*)::int as n from log_entries l join users u on u.id = l.user_id join auth."user" a on a.id::text = u.auth_user_id where a.email = $1`, [email])).rows[0].n;
const ready = async page => {
  await expect(page.locator('#chk-A-d1s1')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.saveflag')).not.toHaveText('Loading…', { timeout: 30_000 });
};

test('a stranger gets the landing page: the production build sends no dev header, and the app is not behind it', async ({ browser }) => {
  const { context, page, devHeaders } = await phone(browser, { returning: false });
  const requests = [];
  page.on('request', r => { if (r.url().includes('/api/')) requests.push(new URL(r.url()).pathname); });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /A weekly training board/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
  await expect(page.locator('#tab-board, #tab-settings, #chk-A-d1s1')).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
  expect(devHeaders).toEqual([]);
  expect(requests).toEqual(['/api/me']); // nothing syncs behind the page: only the one who-is-this question
  await context.close();
});

test('a browser that has been signed in, whose session has expired, gets the app with a sign-in card, not the landing page', async ({ browser }) => {
  const { context, page, devHeaders } = await phone(browser);
  await page.goto('/');
  const card = page.getByRole('status').filter({ hasText: 'Sign in to sync' });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
  await expect(page.locator('#tab-board')).toBeVisible();
  await expect(page.locator('.saveflag')).not.toHaveText('Loading…');
  expect(devHeaders).toEqual([]);
  await context.close();
});

test('signed in: the Account panel names the account, a tick reaches the server, and signing out ends at the landing page', async ({ browser }) => {
  const { context, page, devHeaders } = await phone(browser);
  const email = emailFor('ann');
  await signUp(page, email, 'Ann');
  await page.goto('/');
  await ready(page);
  await expect(page.getByRole('status').filter({ hasText: 'Sign in to sync' })).toHaveCount(0);

  await page.locator('#chk-A-d1s1').check();
  await expect.poll(() => rowsOf(email), { message: 'the check-off reaches the database under her own account' }).toBe(1);

  await page.click('#tab-settings');
  const panel = page.getByRole('region', { name: 'Account' });
  await expect(panel).toContainText(email);
  await panel.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /A weekly training board/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#tab-board')).toHaveCount(0); // the app is hidden again until the next sign-in
  expect(await page.evaluate(() => localStorage.getItem('ironlog:session/known'))).toBeNull();
  expect(devHeaders).toEqual([]);
  await context.close();
});

test('a second account on the same device is held back: the first one\'s data is kept until the user chooses, and never mixed', async ({ browser }) => {
  const { context, page } = await phone(browser);
  const ann = emailFor('ann');
  const bob = emailFor('bob');
  await signUp(page, ann, 'Ann');
  await page.goto('/');
  await ready(page);
  await page.locator('#chk-A-d1s1').check();
  await expect.poll(() => rowsOf(ann)).toBe(1);

  await page.request.post('/api/auth/sign-out', { data: {} });
  await signUp(page, bob, 'Bob');
  await page.reload();
  const card = page.getByRole('alert').filter({ hasText: 'holds data from another account' });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText(bob);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
  expect(await rowsOf(bob)).toBe(0);

  const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: /Download this device/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^iron-log-this-device-/);

  await card.getByRole('button', { name: 'Wipe it and continue' }).click();
  await page.getByRole('button', { name: 'Tap again to wipe this device' }).click();
  await ready(page);
  await expect(page.getByRole('alert').filter({ hasText: 'another account' })).toHaveCount(0);
  await expect(page.locator('#chk-A-d1s1')).not.toBeChecked(); // Ann's tick is not on Bob's board
  expect(await rowsOf(bob)).toBe(0);
  expect(await rowsOf(ann)).toBe(1); // and still safe under her own account
  await context.close();
});

test('an uncaught error on the phone reaches the server\'s error log, and the server accepts it without a sign-in', async ({ browser }) => {
  const { context, page } = await phone(browser);
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'Sign in to sync' })).toBeVisible({ timeout: 30_000 });
  const sent = page.waitForResponse(r => r.url().endsWith('/api/client-errors') && r.request().method() === 'POST');
  // A real uncaught error (the test's fake clock holds timers back, so not a setTimeout).
  await page.evaluate(() => { queueMicrotask(() => { throw new Error('weight 181 test failure'); }); });
  const res = await sent;
  expect(res.status()).toBe(204);
  expect(res.request().postDataJSON()).toMatchObject({ kind: 'error', page: '/' });
  await context.close();
});

test('deleting the account removes the user, the data and every sign-in record, and signing in again starts empty', async ({ browser }) => {
  const { context, page } = await phone(browser);
  const email = emailFor('del');
  await signUp(page, email, 'Del');
  await page.goto('/');
  await ready(page);
  await page.locator('#chk-A-d1s1').check();
  await expect.poll(() => rowsOf(email)).toBe(1);
  const left = async () => (await pool.query(
    `select (select count(*) from auth."user" where email = $1)::int as logins,
            (select count(*) from users u join auth."user" a on a.id::text = u.auth_user_id where a.email = $1)::int as users`, [email])).rows[0];
  expect(await left()).toEqual({ logins: 1, users: 1 });

  await page.click('#tab-settings');
  const panel = page.getByRole('region', { name: 'Delete my data' });
  await panel.getByLabel(/Type DELETE/).fill('DELETE');
  await panel.getByRole('button', { name: 'Delete my account permanently' }).click();
  await expect.poll(left).toEqual({ logins: 0, users: 0 });
  expect(await rowsOf(email)).toBe(0);

  // The app reloads at the landing page: the old cookie opens nothing, and nothing of the account is shown.
  await expect(page.getByRole('heading', { level: 1, name: /A weekly training board/ })).toBeVisible({ timeout: 30_000 });

  // The same Google account signing in again is a brand-new, empty account.
  await signUp(page, email, 'Del again');
  await page.goto('/');
  await page.click('#tab-board'); // the app reopens on the tab it was on: Settings
  await ready(page);
  await expect(page.locator('#chk-A-d1s1')).not.toBeChecked();
  expect(await rowsOf(email)).toBe(0);
  await context.close();
});
