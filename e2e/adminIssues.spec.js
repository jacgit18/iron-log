import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// The admin Issues screen (ADR 013 amendment, step 3), from the phone's side. Every /api/issues call is recorded and answered here, so what
// reaches the server is what is checked. The panel is admin-only: a non-admin account never sees it and never calls the API.
const ISSUES = [
  { fingerprint: 'aaaaaaaaaaaa', kind: 'server', message: 'duplicate key value violates "…"', topFrame: 'foo /server/x.ts:1:2', page: '/api/sync', firstSeen: '2026-10-17T10:00:00Z', lastSeen: '2026-10-18T09:00:00Z', occurrences: 7, firstVersion: '10', lastVersion: '12', status: 'open', note: '' },
  { fingerprint: 'bbbbbbbbbbbb', kind: 'error', message: 'Cannot read properties of undefined', topFrame: '', page: '/progress', firstSeen: '2026-10-16T10:00:00Z', lastSeen: '2026-10-16T11:00:00Z', occurrences: 1, firstVersion: '9', lastVersion: '9', status: 'investigating', note: 'looking into it' },
];
const COUNTS = { fixed: 0, ignored: 0, investigating: 1, open: 1 };

async function setup(page, { admin = true, status = 200 } = {}) {
  const calls = [];
  const now = ISSUES.map(i => ({ ...i })); // what the server holds now; a test can change it between two reads
  Object.defineProperty(calls, 'now', { value: now }); // not enumerable, so `expect(calls).toEqual([])` still means no calls
  await page.addInitScript(({ admin }) => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    if (admin) localStorage.setItem('ironlog:session/admin', 'true');
  }, { admin });
  await page.route('**/api/issues**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const body = req.postData();
    calls.push({ method: req.method(), path: url.pathname.replace('/api/issues', '') || '/', status: url.searchParams.get('status'), body: body ? JSON.parse(body) : null });
    if (status !== 200) return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
    if (req.method() === 'PATCH') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    const wanted = url.searchParams.get('status');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, counts: COUNTS, issues: now.filter(i => !wanted || i.status === wanted) }) });
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.locator('#tab-settings, #account-badge').first().click();
  return calls;
}

test('an admin sees the panel, loads the list only when asked, and finds the open issues first', async ({ page }) => {
  const calls = await setup(page);
  const panel = page.getByRole('region', { name: 'Production issues' });
  await expect(panel).toBeVisible();
  expect(calls).toEqual([]); // nothing is asked for until "Show issues"
  await panel.getByRole('button', { name: 'Show issues' }).click();
  await expect(panel.getByRole('button', { name: /duplicate key value/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Cannot read properties/ })).toHaveCount(0); // the default filter is Open
  expect(calls).toEqual([{ method: 'GET', path: '/', status: 'open', body: null }]);
  await expect(panel.getByRole('button', { name: /Open 1/ })).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', { name: /^All/ }).click();
  await expect(panel.getByRole('button', { name: /Cannot read properties/ })).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: 'GET', status: null });
  await panel.getByRole('button', { name: 'Hide issues' }).click();
  await expect(panel.getByRole('button', { name: /duplicate key value/ })).toHaveCount(0);
});

test('opening an issue shows its facts; changing the status and note sends one PATCH and reloads the list', async ({ page }) => {
  const calls = await setup(page);
  const panel = page.getByRole('region', { name: 'Production issues' });
  await panel.getByRole('button', { name: 'Show issues' }).click();
  await panel.getByRole('button', { name: /duplicate key value/ }).click();
  await expect(panel.getByText('aaaaaaaaaaaa')).toBeVisible();
  await expect(panel.getByText('/api/sync')).toBeVisible();
  await expect(panel.getByText('foo /server/x.ts:1:2')).toBeVisible();
  await panel.getByLabel('Status', { exact: true }).selectOption('investigating');
  await panel.getByLabel('Note', { exact: true }).fill('retry storm after deploy');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => calls.filter(c => c.method === 'PATCH').length).toBe(1);
  expect(calls.find(c => c.method === 'PATCH')).toEqual({ method: 'PATCH', path: '/aaaaaaaaaaaa', status: null, body: { status: 'investigating', note: 'retry storm after deploy' } });
  await expect.poll(() => calls.filter(c => c.method === 'GET').length).toBe(2); // the list is read again after a save
});

test('editing only the note sends only the note, and Save with nothing changed sends nothing', async ({ page }) => {
  const calls = await setup(page);
  const panel = page.getByRole('region', { name: 'Production issues' });
  await panel.getByRole('button', { name: 'Show issues' }).click();
  await panel.getByRole('button', { name: /duplicate key value/ }).click();
  await panel.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(300);
  expect(calls.filter(c => c.method === 'PATCH')).toEqual([]);
  await panel.getByLabel('Note', { exact: true }).fill('only the note');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => calls.filter(c => c.method === 'PATCH').length).toBe(1);
  expect(calls.find(c => c.method === 'PATCH').body).toEqual({ note: 'only the note' });
});

test('a status someone else changed is not put back: after the list reloads the row shows the new value and Save sends only what was edited', async ({ page }) => {
  const calls = await setup(page);
  const panel = page.getByRole('region', { name: 'Production issues' });
  await panel.getByRole('button', { name: 'Show issues' }).click();
  await panel.getByRole('button', { name: /duplicate key value/ }).click();
  await expect(panel.getByLabel('Status', { exact: true })).toHaveValue('open');
  calls.now[0].status = 'fixed'; // another admin fixed it
  await panel.getByRole('button', { name: /^All/ }).click(); // the list is read again
  await expect(panel.getByLabel('Status', { exact: true })).toHaveValue('fixed');
  await panel.getByLabel('Note', { exact: true }).fill('checked after the fix');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => calls.filter(c => c.method === 'PATCH').length).toBe(1);
  expect(calls.find(c => c.method === 'PATCH').body).toEqual({ note: 'checked after the fix' });
});

test('passes the accessibility scan with the list open and an issue expanded', async ({ page }) => {
  await setup(page);
  const panel = page.getByRole('region', { name: 'Production issues' });
  await panel.getByRole('button', { name: 'Show issues' }).click();
  await panel.getByRole('button', { name: /duplicate key value/ }).click();
  await expect(panel.getByLabel('Note', { exact: true })).toBeVisible();
  const scan = await new AxeBuilder({ page }).include('section[aria-labelledby="issues-h"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(scan.violations.map(v => v.id)).toEqual([]);
});

test('says so when the server refuses, and when the account is not an admin it shows nothing and asks for nothing', async ({ page }) => {
  const calls = await setup(page, { status: 403 });
  const panel = page.getByRole('region', { name: 'Production issues' });
  await panel.getByRole('button', { name: 'Show issues' }).click();
  await expect(panel.getByText(/Not allowed\. An admin needs both/)).toBeVisible();
  expect(calls).toHaveLength(1);
});

test('is not offered to an account that is not an admin', async ({ page }) => {
  const calls = await setup(page, { admin: false });
  await expect(page.getByRole('heading', { name: 'Rest timer alert' })).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Production issues' })).toHaveCount(0);
  expect(calls).toEqual([]);
});
