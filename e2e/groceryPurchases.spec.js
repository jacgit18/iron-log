import { test, expect } from './fixtures.js';

// The purchase log (brief grocery-purchase-log). A unit test cannot see the real At home tick closing a purchase, the item coming back on Shopping,
// the second purchase listed with the first on Bought, or that a reload keeps both in storage. The fixed date is in September 2026.
const CATALOGUE = { stores: ['Aldi'], items: [{ id: 'milk', n: 'Milk', store: 'Aldi', qty: 1, cents: 400, every: true, out: false }], groups: [{ id: 'g1', n: 'Pair', people: [{ id: 'sis', n: 'Sister' }], stores: ['Aldi'] }] }; // Aldi is shared two ways, so Who owes who has a card and Spending is your half
const MONTH = { lines: { milk: { got: true, at: '2026-09-03T10:00', qty: 1, cents: 400 } }, pulled: [] };
const KEYS = { cat: 'ironlog:grocery/main', month: 'ironlog:grocery/2026-09' };
const seed = async page => {
  await page.evaluate(({ CATALOGUE, MONTH, KEYS }) => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem(KEYS.cat, JSON.stringify(CATALOGUE));
    localStorage.setItem(KEYS.month, JSON.stringify(MONTH));
  }, { CATALOGUE, MONTH, KEYS });
  await page.reload();
};
const open = async (page, view) => { await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click(`#groc-view-${view}`); };
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).lines.milk, KEYS.month);

test('ran out keeps the purchase, buying again adds a second one, and both are listed with their dates after a reload', async ({ page }) => {
  await seed(page);
  await open(page, 'inventory');
  await expect(page.locator('#groc-have-milk')).toBeChecked();

  await page.locator('#groc-have-milk').uncheck(); // I ran out
  await expect(page.locator('#groc-have-milk')).not.toBeChecked();
  await expect.poll(async () => (await stored(page)).buys?.length).toBe(1); // the save is a moment behind the tick
  let line = await stored(page);
  expect(line.got).toBeUndefined();
  expect(line.buys[0]).toMatchObject({ at: '2026-09-03T10:00', qty: 1, cents: 400, store: 'Aldi' });

  await page.click('#groc-view-bought'); await page.click('#groc-bought-history'); // Spending and Who owes who keep the closed purchase's cost in the month
  await expect(page.locator('#groc-spend-summary')).toContainText('This month $2.00 so far');
  await page.click('#groc-bought-month'); await page.getByRole('button', { name: /^Who owes who/ }).click();
  await expect(page.locator('.gsplitsum')).toContainText('Paid$4.00');
  await page.click('#groc-view-shopping'); // back on To get, unticked
  await expect(page.locator('#groc-milk')).not.toBeChecked();
  await page.locator('#groc-milk').click(); // bought again (the row may move, so no check() state wait)
  await expect.poll(async () => (await stored(page)).got).toBe(true);
  line = await stored(page);
  expect(line.buys).toHaveLength(1);
  expect(line.at).toMatch(/^2026-09-\d\dT\d\d:\d\d$/);

  await page.reload();
  await open(page, 'bought');
  await page.getByRole('button', { name: /Milk/ }).first().click(); // open the row's details
  const buys = page.getByRole('list', { name: 'Purchases of Milk this month' }).locator('li');
  await expect(buys).toHaveCount(2);
  await expect(buys.nth(1)).toContainText('3 Sep 10:00'); // the first purchase, with its own date and time
  await page.click('#groc-bought-history'); // the month counts both purchases
  await expect(page.locator('#groc-spend-summary')).toContainText('This month $4.00 so far');
  await page.click('#groc-bought-month'); await page.getByRole('button', { name: /^Who owes who/ }).click();
  await expect(page.locator('.gsplitsum')).toContainText('Paid$8.00');

  await page.locator('#groc-milk').uncheck(); // unticking on Bought removes only the open purchase, never the closed one
  await expect.poll(async () => (await stored(page)).got).toBeUndefined();
  line = await stored(page);
  expect(line.buys).toHaveLength(1);
  expect(line.buys[0]).toMatchObject({ at: '2026-09-03T10:00', cents: 400 });
});
