import { test, expect } from './fixtures.js';
import { photo } from './receiptHelpers.js';

// Receipt: merge repeated lines (brief receipt-merge-lines). Grouping, the totals and the plan are node tests (receiptGroup.test.ts); this covers the wiring a unit test
// cannot: one row and one checkbox for a repeated line, Add to list once, Apply writing one Inventory item with each pack's own price, Undo, and "Show these lines
// separately" bringing back today's rows and the duplicate-name refusal. The route is stubbed: no photo leaves the test. The fixed date is September 2026 (month 2026-09).
const eggs = { text: 'EGGS LRG', qty: 1, grossCents: 899, discountCents: 0, matchId: null };
const beef = (c) => ({ text: 'BEEF CHUCK ROAST', qty: 1, grossCents: c, discountCents: 0, matchId: null });
const seed = async page => {
  await page.evaluate(() => {
    localStorage.setItem('ironlog:session/admin', 'true');
    localStorage.setItem('ironlog:grocery/main', JSON.stringify({ stores: ["BJ's"], items: [{ id: 'rice', n: 'Rice', store: '', qty: 1, cents: 700, every: true, out: false }] }));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify({ lines: {}, pulled: [] }));
  });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-shopping');
};
const answer = (page, lines) => page.route('**/api/scan/receipt', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { kind: 'ok', receipt: { store: "BJ'S", date: '2026-09-10', lines } } }) }));
const month = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/2026-09') ?? '{"lines":{}}').lines);
// the items the scan created: the list starts with one other item (the scan control needs a list)
const items = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/main')).items.filter(i => i.id !== 'rice'));
const scan = async page => { await page.getByLabel('Receipt photo').setInputFiles(photo); return page.getByRole('dialog'); };

test('two identical lines are one row with one checkbox and a count of 2; Add to list once gives one item', async ({ page }) => {
  await seed(page); await answer(page, [eggs, eggs]);
  const sheet = await scan(page);
  await expect(sheet.locator('.rcrow')).toHaveCount(1);
  await expect(sheet.locator('.rcrow').getByRole('checkbox')).toHaveCount(1);
  await expect(sheet.locator('.rcqty')).toHaveText('2');
  await expect(sheet.getByText('$8.99 each')).toBeVisible();
  await sheet.getByRole('button', { name: 'Add to list: EGGS LRG' }).click();
  await expect(sheet.locator('#rc-new-qty')).toHaveValue('2');
  await expect(sheet.locator('#rc-new-price')).toHaveValue('8.99');
  await sheet.locator('#rc-new-add').click();
  await sheet.getByRole('button', { name: 'Apply 1 item' }).click();
  const made = await items(page);
  expect(made).toHaveLength(1);
  expect((await month(page))[made[0].id]).toMatchObject({ got: true, qty: 2, cents: 899 });
});

test('the beef lines at two prices are one row; Apply gives one Inventory item and the month keeps both prices; Undo removes it', async ({ page }) => {
  await seed(page); await answer(page, [beef(1412), beef(1786)]);
  const sheet = await scan(page);
  await expect(sheet.locator('.rcrow')).toHaveCount(1);
  await expect(sheet.getByText('2 packs, each at its own price: $14.12 + $17.86')).toBeVisible();
  await expect(sheet.locator('.rcnet')).toHaveText('$31.98');
  await sheet.getByRole('button', { name: 'Add to list: BEEF CHUCK ROAST' }).click();
  await expect(sheet.locator('#rc-new-qty')).toHaveValue('2');
  await expect(sheet.locator('#rc-new-price')).toHaveValue('15.99');
  await sheet.locator('#rc-new-add').click();
  await expect(sheet.getByText('1 new item will be added.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Apply 1 item' }).click();
  const made = await items(page);
  expect(made).toHaveLength(1);
  expect((await month(page))[made[0].id]).toMatchObject({ got: true, prices: [1412, 1786] });
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await items(page)).toHaveLength(0);
  expect(await month(page)).toEqual({});
});

test('Show these lines separately splits the row back, and a second Add to list with the same name is refused as before', async ({ page }) => {
  await seed(page); await answer(page, [beef(1412), beef(1786)]);
  const sheet = await scan(page);
  await sheet.getByRole('button', { name: 'Show these lines separately: BEEF CHUCK ROAST' }).click();
  await expect(sheet.locator('.rcrow')).toHaveCount(2);
  await expect(sheet.getByRole('button', { name: 'Show these lines separately: BEEF CHUCK ROAST' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Add to list: BEEF CHUCK ROAST' }).first().click();
  await sheet.locator('#rc-new-add').click();
  await sheet.getByRole('button', { name: 'Add to list: BEEF CHUCK ROAST' }).click();
  await sheet.locator('#rc-new-add').click();
  await expect(sheet.getByRole('alert')).toContainText('already in this store');
});
