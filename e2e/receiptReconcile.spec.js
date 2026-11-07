import { test, expect } from './fixtures.js';
import { photo } from './receiptHelpers.js';

// Receipt: reconcile items already ticked in the store (brief receipt-reconcile-ticked). The was and now words, the not-on-receipt list and Undo are node tests
// (receiptReconcile.test.ts); this covers the wiring a unit test cannot: the note under a ticked row and not under an unticked one, the list of ticked items the
// receipt does not show, Untick writing and Undo putting the line back. The route is stubbed: no photo leaves the test. The fixed date is September 2026 (2026-09).
const item = (id, n, cents = null) => ({ id, n, store: '', qty: 1, cents, every: true, out: false });
const line = (text, grossCents, matchId) => ({ text, qty: 1, grossCents, discountCents: 0, matchId });
const items = [item('eggs', 'Eggs'), item('chick', 'Rotisserie chicken', 429), item('almonds', 'Almonds', 1199), item('milk', 'Milk', 379)];
const seed = async (page, lines, list = items, stores = ["BJ's"]) => {
  await page.evaluate(({ lines, items, stores }) => {
    localStorage.setItem('ironlog:session/admin', 'true');
    localStorage.setItem('ironlog:grocery/main', JSON.stringify({ stores, items }));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify({ lines, pulled: [] }));
  }, { lines, items: list, stores });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-get');
};
const answer = (page, lines, store) => page.route('**/api/scan/receipt', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { kind: 'ok', receipt: { ...(store ? { store } : {}), date: '2026-09-10', lines } } }) }));
const month = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/2026-09') ?? '{"lines":{}}').lines);
const scan = async page => { await page.getByLabel('Receipt photo').setInputFiles(photo); return page.getByRole('dialog'); };
const row = (sheet, text) => sheet.locator('.rcrow', { hasText: text });
const ticked = { eggs: { got: true, unpriced: true, qty: 1 }, chick: { got: true, qty: 1, cents: 429 }, milk: { got: true, qty: 1, cents: 379 } };

test('a ticked item shows what the list has and what the receipt says; an unticked one shows nothing; Apply prices it and Undo puts it back', async ({ page }) => {
  await seed(page, { eggs: ticked.eggs, chick: ticked.chick });
  await answer(page, [line('ORG EGGS 18CT', 899, 'eggs'), line('ROTISSERIE CHKN', 499, 'chick'), line('ALMONDS 3LB', 1249, 'almonds')]);
  const request = page.waitForRequest('**/api/scan/receipt');
  const sheet = await scan(page);
  const sent = (await request).postDataJSON();
  expect(sent.items.filter(i => i.got).map(i => i.id).sort()).toEqual(['chick', 'eggs']); // only the items ticked this month carry the hint
  await expect(row(sheet, 'ORG EGGS 18CT').locator('.rcwas')).toContainText('Price added');
  await expect(row(sheet, 'ORG EGGS 18CT').locator('.rcwas')).toContainText('Was no price, now 1 × $8.99');
  await expect(row(sheet, 'ROTISSERIE CHKN').locator('.rcwas')).toContainText('Price changed');
  await expect(row(sheet, 'ROTISSERIE CHKN').locator('.rcwas')).toContainText('Was 1 × $4.29, now 1 × $4.99');
  await expect(row(sheet, 'ALMONDS 3LB').locator('.rcwas')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Apply 3 items' }).click();
  expect((await month(page)).eggs).toMatchObject({ got: true, qty: 1, cents: 899 });
  expect((await month(page)).eggs.unpriced).toBeUndefined();
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await month(page)).eggs).toEqual({ got: true, unpriced: true, qty: 1 });
  expect((await month(page)).chick).toEqual({ got: true, qty: 1, cents: 429 });
  expect((await month(page)).almonds).toBeUndefined();
});

test('a ticked item the receipt does not show is listed and stays bought; Move back to to-get unticks it on Apply and Undo ticks it back with its price', async ({ page }) => {
  await seed(page, ticked);
  await answer(page, [line('ORG EGGS 18CT', 899, 'eggs'), line('ROTISSERIE CHKN', 499, 'chick')]);
  const sheet = await scan(page);
  const miss = sheet.getByRole('group', { name: 'Marked bought, but not on this receipt' });
  await expect(miss.getByText('Milk')).toBeVisible();
  await expect(miss.getByText('Marked bought: 1 × $3.79')).toBeVisible();
  await expect(miss.getByText('Stays bought')).toBeVisible();
  await miss.getByLabel('Move Milk back to to-get').check();
  await expect(miss.getByText('Will move back to to-get')).toBeVisible();
  await expect(sheet.getByText('1 will move back to to-get.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Apply 2 items' }).click();
  await expect(page.getByText('1 item moved back to to-get.')).toBeVisible();
  expect((await month(page)).milk?.got).toBeUndefined();
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await month(page)).milk).toEqual({ got: true, qty: 1, cents: 379 });
});

test('leaving a ticked item unticked-by-choice alone writes nothing for it, and leaving a receipt row out puts its item in the list', async ({ page }) => {
  await seed(page, ticked);
  await answer(page, [line('ORG EGGS 18CT', 899, 'eggs'), line('ROTISSERIE CHKN', 499, 'chick')]);
  const sheet = await scan(page);
  const miss = sheet.getByRole('group', { name: 'Marked bought, but not on this receipt' });
  await expect(miss.getByText('Eggs')).toHaveCount(0);
  await sheet.getByLabel('Include ORG EGGS 18CT').uncheck();
  await expect(miss.getByText('Eggs')).toBeVisible();
  await sheet.getByLabel('Include ORG EGGS 18CT').check();
  await expect(miss.getByText('Eggs')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Apply 2 items' }).click();
  expect((await month(page)).milk).toEqual({ got: true, qty: 1, cents: 379 });
});

test('with the receipt\'s store known, a ticked item counted at another store is not listed as missing, and one counted here is', async ({ page }) => {
  const list = [{ ...item('eggs', 'Eggs'), store: "BJ's" }, { ...item('milk', 'Milk', 379), store: 'Aldi' }, { ...item('almonds', 'Almonds', 1199), store: "BJ's" }];
  await seed(page, { eggs: { got: true, qty: 1 }, milk: { got: true, qty: 1, cents: 379 }, almonds: { got: true, qty: 1, cents: 1199 } }, list, ["BJ's", 'Aldi']);
  await answer(page, [line('ORG EGGS 18CT', 899, 'eggs')], "BJ'S");
  const sheet = await scan(page);
  const miss = sheet.getByRole('group', { name: 'Marked bought, but not on this receipt' });
  await expect(miss.getByText('Almonds')).toBeVisible();
  await expect(miss.getByText('Milk')).toHaveCount(0);
});

test('with only a Move back chosen, the button says Move 1 item back to to-get and the notice says what was moved', async ({ page }) => {
  await seed(page, ticked);
  await answer(page, [line('ORG EGGS 18CT', 899, 'eggs')]);
  const sheet = await scan(page);
  await sheet.getByLabel('Include ORG EGGS 18CT').uncheck();
  await sheet.getByRole('group', { name: 'Marked bought, but not on this receipt' }).getByLabel('Move Milk back to to-get').check();
  await sheet.getByRole('button', { name: 'Move 1 item back to to-get' }).click();
  await expect(page.getByText('Moved 1 item back to to-get for')).toBeVisible();
  expect((await month(page)).milk?.got).toBeUndefined();
});
