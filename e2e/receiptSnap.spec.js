import { test, expect } from './fixtures.js';
import { PNG, photo } from './receiptHelpers.js';

// Snap now, log later (brief receipt-snap-now-log-later). Validation, the PATCH rules, the status default and the caps are node tests (server/receipts.test.ts,
// receiptsClient.test.ts, receiptToLog.test.ts); this covers the wiring: Snap & save saving a photo unread, the To log card on a second browser, Open and Read this receipt,
// Apply updating the same saved row (no second upload) and Undo putting it back, Delete, a failed save kept for Try again, and a receipt another device already logged.
// /api/receipts and /api/scan/receipt are stubbed with one in-memory account that two browsers share: no photo leaves the test.
const add = async (page, n) => { await page.fill('#groc-name', n); await page.click('#groc-add'); await expect(page.locator('#groc-name')).toHaveValue(''); };
const setup = async page => {
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-edit');
  await add(page, 'Eggs'); await add(page, 'Rice');
  await page.click('#groc-done');
  await page.click('#groc-view-shopping');
};
const scanAnswer = async page => {
  const state = { scans: 0 };
  await page.route('**/api/scan/receipt', async route => {
    state.scans++;
    const { items } = route.request().postDataJSON();
    const id = n => items.find(i => i.n === n)?.id ?? null;
    const result = { kind: 'ok', receipt: { store: "BJ'S", date: '2026-09-24', taxCents: 0, totalCents: 2698, lines: [{ text: 'EGGS LRG 5 DZ', qty: 2, grossCents: 2698, discountCents: 0, matchId: id('Eggs') }] } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result }) });
  });
  return state;
};
// One account's receipts on a fake server; every browser that calls `serve` shares it.
const account = () => ({ rows: [], posts: [], patches: [], deletes: [], next: 1, failSaves: 0 });
const serve = async (page, state) => {
  const reply = (route, body, status = 200, type = 'application/json') => route.fulfill({ status, contentType: type, body: typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body) });
  await page.route('**/api/receipts**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace('/api/receipts', '');
    if (req.method() === 'POST') {
      const b = req.postDataJSON();
      state.posts.push(b);
      if (state.failSaves > 0) { state.failSaves--; return reply(route, { ok: false }, 500); }
      const row = { id: String(state.next++), savedAt: '2026-11-18T15:00:00.000Z', month: b.month, receiptDate: b.receiptDate, store: b.store, totalCents: b.totalCents, note: '', sizeBytes: 1000, status: b.status ?? 'logged' };
      state.rows.unshift(row);
      return reply(route, { ok: true, receipt: row }, 201);
    }
    if (req.method() === 'GET' && path === '') return reply(route, { ok: true, receipts: state.rows, count: state.rows.length, bytes: state.rows.length * 1000, maxReceipts: 200, maxBytes: 62914560 });
    const m = path.match(/^\/(\d+)(\/photo)?$/);
    const row = m && state.rows.find(r => r.id === m[1]);
    if (!row) return reply(route, { ok: false }, 404);
    if (req.method() === 'GET' && m[2]) return reply(route, PNG, 200, 'image/jpeg');
    if (req.method() === 'PATCH') {
      const b = req.postDataJSON();
      state.patches.push(b);
      if (b.ifStatus && row.status !== b.ifStatus) return reply(route, { ok: false, why: 'status', status: row.status }, 409);
      for (const k of ['status', 'store', 'receiptDate', 'totalCents', 'month', 'note']) if (k in b) row[k] = b[k];
      return reply(route, { ok: true, receipt: row });
    }
    if (req.method() === 'DELETE') { state.rows = state.rows.filter(r => r !== row); state.deletes.push(row.id); return reply(route, { ok: true }); }
    return reply(route, { ok: false }, 405);
  });
};
const snap = async page => {
  await page.click('#groc-scan');
  const chooser = page.waitForEvent('filechooser');
  await page.click('#groc-scan-snap');
  await (await chooser).setFiles(photo);
};
const toLog = page => page.locator('#groc-tolog');

test('Snap & save keeps the photo unread under To log, with nothing changed on the list, and it is still there after a reload', async ({ page }) => {
  const acct = account(); await serve(page, acct);
  const scans = await scanAnswer(page);
  await setup(page);
  await page.click('#groc-scan');
  await expect(page.getByRole('button', { name: 'Snap & save' })).toBeVisible();
  await expect(page.getByText('Snap & save keeps the photo to read later, on any device.')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Snap & save' }).click();
  await (await chooser).setFiles(photo);
  await expect(toLog(page).getByText('To log (1)')).toBeVisible();
  await expect(toLog(page).getByRole('button', { name: 'Open' })).toBeVisible();
  expect(acct.posts).toHaveLength(1);
  expect(acct.posts[0]).toMatchObject({ status: 'to_log', month: '2026-09', store: '', receiptDate: null, totalCents: null });
  expect(scans.scans).toBe(0); // nothing is read at snap time
  await expect(page.locator('#groc-summary')).toContainText('Bought 0 of 2');
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await expect(toLog(page).getByText('To log (1)')).toBeVisible();
});

test('the same receipt shows under To log on a second signed-in browser at desktop width', async ({ page, browser }) => {
  const acct = account(); await serve(page, acct);
  await setup(page);
  await snap(page);
  await expect(toLog(page).getByText('To log (1)')).toBeVisible();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  try {
    const desk = await ctx.newPage();
    await desk.addInitScript(() => { localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); });
    await serve(desk, acct);
    await desk.goto('/');
    await setup(desk);
    await expect(toLog(desk).getByText('To log (1)')).toBeVisible();
    await expect(toLog(desk).getByRole('button', { name: 'Open' })).toBeVisible();
  } finally { await ctx.close(); }
});

test('Open shows the photo unread, Read this receipt scans it, Apply updates the same saved row with no second upload, and Undo puts it back under To log', async ({ page }) => {
  const acct = account(); await serve(page, acct);
  const scans = await scanAnswer(page);
  await setup(page);
  await snap(page);
  await toLog(page).getByRole('button', { name: 'Open' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Receipt to log' })).toBeVisible();
  await expect(sheet.getByRole('img', { name: /Photo of the receipt/ })).toBeVisible();
  expect(scans.scans).toBe(0); // opening reads nothing
  await expect(page.locator('#groc-summary')).toContainText('Bought 0 of 2');
  await sheet.getByRole('button', { name: 'Read this receipt' }).click();
  await expect(sheet.getByRole('heading', { name: 'Receipt', exact: true })).toBeVisible();
  expect(scans.scans).toBe(1);
  await expect(sheet.getByRole('checkbox', { name: /Keep a copy/ })).toHaveCount(0); // it is already saved
  await expect(sheet.getByRole('button', { name: 'Save for later' })).toHaveCount(0);
  await expect(sheet.getByText('Show the receipt photo')).toBeVisible();
  await expect(page.locator('#groc-summary')).toContainText('Bought 0 of 2'); // nothing changes before Apply
  await sheet.getByLabel('Add this store to your stores').uncheck();
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#groc-summary')).toContainText('Bought 1 of 2');
  await expect(toLog(page)).toHaveCount(0);
  expect(acct.posts).toHaveLength(1);
  expect(acct.patches.at(-1)).toMatchObject({ status: 'logged', ifStatus: 'to_log', store: "BJ'S", receiptDate: '2026-09-24', totalCents: 2698, month: '2026-09' });
  expect(acct.rows[0].status).toBe('logged');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#groc-summary')).toContainText('Bought 0 of 2');
  await expect(toLog(page).getByText('To log (1)')).toBeVisible();
  expect(acct.patches.at(-1)).toEqual({ status: 'to_log', ifStatus: 'logged' });
  expect(acct.rows[0].status).toBe('to_log');
});

test('Delete on a To log row asks first, then removes the receipt and its photo', async ({ page }) => {
  const acct = account(); await serve(page, acct);
  await setup(page);
  await snap(page);
  await toLog(page).getByRole('button', { name: 'Delete' }).click();
  await toLog(page).getByRole('button', { name: 'Keep it' }).click();
  expect(acct.deletes).toEqual([]);
  await toLog(page).getByRole('button', { name: 'Delete' }).click();
  await toLog(page).getByRole('button', { name: 'Delete for good' }).click();
  await expect(toLog(page)).toHaveCount(0);
  expect(acct.deletes).toEqual(['1']);
  expect(acct.rows).toHaveLength(0);
});

test('a failed upload keeps the photo for Try again, and one retry saves one receipt', async ({ page }) => {
  const acct = account(); acct.failSaves = 1; await serve(page, acct);
  await setup(page);
  await snap(page);
  await expect(page.getByText('The photo was not saved.')).toBeVisible();
  await expect(toLog(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(toLog(page).getByText('To log (1)')).toBeVisible();
  expect(acct.posts).toHaveLength(2);
  expect(acct.posts[1].image).toBe(acct.posts[0].image);
  expect(acct.rows).toHaveLength(1);
});

test('a receipt another device already logged says so and opens nothing', async ({ page }) => {
  const acct = account(); await serve(page, acct);
  await setup(page);
  await snap(page);
  await expect(toLog(page).getByText('To log (1)')).toBeVisible();
  acct.rows[0].status = 'logged'; // the other device applied it
  await toLog(page).getByRole('button', { name: 'Open' }).click();
  await expect(page.getByText('That receipt was already logged on another device.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(toLog(page)).toHaveCount(0);
});

test('Apply stops before writing any price when another device logged the receipt after it was opened', async ({ page }) => {
  const acct = account(); await serve(page, acct);
  await scanAnswer(page);
  await setup(page);
  await snap(page);
  await toLog(page).getByRole('button', { name: 'Open' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Read this receipt' }).click();
  await expect(sheet.getByRole('heading', { name: 'Receipt', exact: true })).toBeVisible();
  acct.rows[0].status = 'logged'; // the other device applied it first
  await sheet.getByLabel('Add this store to your stores').uncheck();
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  await expect(sheet.getByText('Another device already logged this receipt, so nothing was applied here.')).toBeVisible();
  await expect(page.locator('#groc-summary')).toContainText('Bought 0 of 2');
  expect(acct.patches.at(-1)).toMatchObject({ status: 'logged', ifStatus: 'to_log' });
  expect(acct.rows[0].store).toBe(''); // the loser changed nothing
});
