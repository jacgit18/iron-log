import { test, expect } from './fixtures.js';
import { PNG, photo } from './receiptHelpers.js';

// Keep a copy of a scanned receipt's photo (brief receipt-save-photo). Validation, the caps, ownership and the headers are node tests (server/receipts.test.ts,
// receiptsClient.test.ts); this covers the wiring a unit test cannot: the unticked box saving nothing, the ticked one saving once with the reviewed values,
// Cancel saving nothing, the Receipts page at its address with Back and reload, the viewer, a note, Delete, and a failed save keeping the prices with Try again.
// Both routes are stubbed: no photo leaves the test.
const asAdmin = page => page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true'));
const add = async (page, n) => { await page.fill('#groc-name', n); await page.click('#groc-add'); await expect(page.locator('#groc-name')).toHaveValue(''); };
const setup = async page => {
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-edit');
  await add(page, 'Eggs'); await add(page, 'Rice');
  await page.click('#groc-done');
  await page.click('#groc-view-get');
};
const scanAnswer = page => page.route('**/api/scan/receipt', async route => {
  const { items } = route.request().postDataJSON();
  const id = n => items.find(i => i.n === n)?.id ?? null;
  const result = { kind: 'ok', receipt: { store: "BJ'S", date: '2026-09-24', taxCents: 0, totalCents: 2698, lines: [{ text: 'EGGS LRG 5 DZ', qty: 2, grossCents: 2698, discountCents: 0, matchId: id('Eggs') }] } };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result }) });
});
// A small in-memory server for /api/receipts: records every POST body, serves the list, the photo, the note and the delete.
const receiptsApi = async (page, { failFirstSave = false } = {}) => {
  const state = { rows: [], posts: [], next: 1, fail: failFirstSave };
  const reply = (route, body, status = 200, type = 'application/json') => route.fulfill({ status, contentType: type, body: typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body) });
  const shape = r => { const { data: _data, ...rest } = r; return rest; };
  await page.route('**/api/receipts**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/receipts', '');
    if (req.method() === 'POST') {
      state.posts.push(req.postDataJSON());
      if (state.fail) { state.fail = false; return reply(route, { ok: false }, 500); }
      const b = req.postDataJSON();
      const row = { id: String(state.next++), savedAt: '2026-11-04T12:00:00.000Z', month: b.month, receiptDate: b.receiptDate, store: b.store, totalCents: b.totalCents, note: '', sizeBytes: 1000 };
      state.rows.unshift(row);
      return reply(route, { ok: true, receipt: row }, 201);
    }
    if (req.method() === 'GET' && path === '') return reply(route, { ok: true, receipts: state.rows.map(shape), count: state.rows.length, bytes: state.rows.length * 1000, maxReceipts: 200, maxBytes: 62914560 });
    const m = path.match(/^\/(\d+)(\/photo)?$/);
    const row = m && state.rows.find(r => r.id === m[1]);
    if (!row) return reply(route, { ok: false }, 404);
    if (req.method() === 'GET' && m[2]) return reply(route, PNG, 200, 'image/jpeg');
    if (req.method() === 'PATCH') { row.note = req.postDataJSON().note; return reply(route, { ok: true, receipt: row }); }
    if (req.method() === 'DELETE') { state.rows = state.rows.filter(r => r !== row); return reply(route, { ok: true }); }
    return reply(route, { ok: false }, 405);
  });
  return state;
};
const scan = async page => {
  await page.getByLabel('Receipt photo').setInputFiles(photo);
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Receipt' })).toBeVisible();
};

test('a person who is not an admin sees no Receipts button and no Keep box', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#groc-receipts')).toHaveCount(0);
});

test.describe('as an admin', () => {
  test.beforeEach(async ({ page }) => { await asAdmin(page); await page.reload(); await setup(page); await scanAnswer(page); });

  test('the box is off by default: Apply without it, and Cancel with it, save nothing; Apply with it saves once with the reviewed values', async ({ page }) => {
    const api = await receiptsApi(page);
    await scan(page);
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByLabel('Keep a copy of this photo')).not.toBeChecked();
    await sheet.getByRole('button', { name: 'Apply 1 item' }).click();
    await expect(page.getByText('Applied 1 item for')).toBeVisible();
    expect(api.posts).toHaveLength(0);

    await scan(page);
    await page.getByRole('dialog').getByLabel('Keep a copy of this photo').check();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(api.posts).toHaveLength(0);

    await scan(page);
    await page.getByRole('dialog').getByLabel('Keep a copy of this photo').check();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply 1 item' }).click();
    await expect(page.getByText('Photo saved. Find it under Receipts.')).toBeVisible();
    expect(api.posts).toHaveLength(1);
    expect(api.posts[0]).toMatchObject({ store: "BJ'S", receiptDate: '2026-09-24', totalCents: 2698, month: expect.stringMatching(/^\d{4}-\d{2}$/) });
    expect(api.posts[0].image.startsWith('/9j/')).toBe(true);
  });

  test('the Receipts page has an address, Back goes up, a reload reopens it; a row opens the viewer; a note persists; Delete asks first and removes it', async ({ page }) => {
    const api = await receiptsApi(page);
    await scan(page);
    await page.getByRole('dialog').getByLabel('Keep a copy of this photo').check();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply 1 item' }).click();
    await expect(page.getByText('Photo saved. Find it under Receipts.')).toBeVisible();

    await page.click('#groc-receipts');
    await expect(page).toHaveURL(/#\/daily\/grocery\/receipts$/);
    await expect(page.getByRole('heading', { name: 'Saved receipts' })).toBeVisible();
    await expect(page.getByRole('button', { name: "BJ'S, Sep 24, $26.98" })).toBeVisible();
    await expect(page.locator('#rcs-usage')).toContainText('1 of 200 saved');

    await page.goBack();
    await expect(page).toHaveURL(/#\/daily\/grocery\/get$/);
    await page.goForward();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Saved receipts' })).toBeVisible();
    await expect(page.getByRole('button', { name: "BJ'S, Sep 24, $26.98" })).toBeVisible();

    await page.getByRole('button', { name: "BJ'S, Sep 24, $26.98" }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('img', { name: /Photo of the receipt/ })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Download' })).toHaveAttribute('download', 'receipt-2026-09-24-bjs.jpg');
    await sheet.getByLabel('Note').fill('for the fridge');
    await sheet.getByRole('button', { name: 'Save note' }).click();
    await expect(sheet.getByText('Note saved.')).toBeVisible();
    expect(api.rows[0].note).toBe('for the fridge');
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('for the fridge')).toBeVisible();

    await page.getByRole('button', { name: /BJ'S, Sep 24/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete this receipt' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Keep it' }).click();
    expect(api.rows).toHaveLength(1);
    await page.getByRole('dialog').getByRole('button', { name: 'Delete this receipt' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#rcs-empty')).toBeVisible();
    expect(api.rows).toHaveLength(0);
  });

  test('a failed save keeps the prices applied, says the photo was not saved, and Try again saves it', async ({ page }) => {
    const api = await receiptsApi(page, { failFirstSave: true });
    await scan(page);
    await page.getByRole('dialog').getByLabel('Keep a copy of this photo').check();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply 1 item' }).click();
    await expect(page.locator('#groc-summary')).toContainText('Got 1 of 2');
    await expect(page.getByText('Receipt applied. The photo was not saved.')).toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Photo saved. Find it under Receipts.')).toBeVisible();
    expect(api.posts).toHaveLength(2);
    expect(api.rows).toHaveLength(1);
  });
});
