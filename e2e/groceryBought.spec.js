import { test, expect } from './fixtures.js';

// The Bought view (brief groceries-shopping-bought-inventory): Shopping | Bought | Inventory | Spending, a tick moves a row to Bought, Select works there,
// and the old addresses still open the renamed screens. A unit test cannot catch the switch, the address or the row moving between two pages. The fixed date is in September 2026.
const CATALOGUE = {
  stores: ['Costco', "Trader Joe's"],
  items: [
    { id: 'eggs', n: 'Eggs', store: 'Costco', qty: 1, cents: 899, every: true, out: false },
    { id: 'beef', n: 'Beef roast', store: 'Costco', qty: 1, cents: 1599, every: true, out: false },
    { id: 'oat', n: 'Oat milk', store: "Trader Joe's", qty: 1, cents: 349, every: true, out: false },
  ],
  groups: [{ id: 'g1', n: 'Home', people: [{ id: 'sam', n: 'Sam' }, { id: 'alex', n: 'Alex' }], stores: ['Costco'] }],
};
const MONTH = { lines: { eggs: { got: true }, beef: { got: true } }, pulled: [] };
const open = async (page) => {
  await page.evaluate(({ CATALOGUE, MONTH }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(MONTH));
  }, { CATALOGUE, MONTH });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
};
const view = (page, name) => page.locator('.seg[aria-label="Grocery view"]').getByRole('button', { name });

test('four views with counts: a tick moves a row from Shopping to Bought, and the address follows each view', async ({ page }) => {
  await open(page);
  await expect(view(page, 'Shopping')).toHaveText('Shopping 1');
  await expect(view(page, 'Bought')).toHaveText('Bought 2');
  await expect(view(page, 'Inventory')).toBeVisible();
  await expect(view(page, 'Spending')).toBeVisible();
  await expect(page.getByText('Oat milk')).toBeVisible();
  await expect(page.getByText('Beef roast')).toHaveCount(0); // bought: not on Shopping
  await page.getByLabel('Got Oat milk').click();
  await expect(view(page, 'Shopping')).toHaveText('Shopping');
  await expect(view(page, 'Bought')).toHaveText('Bought 3');
  await view(page, 'Bought').click();
  await expect(page).toHaveURL(/#\/daily\/grocery\/bought$/);
  await expect(page.locator('#groc-sub')).toContainText('Bought this month');
  await expect(page.getByText('Oat milk')).toBeVisible();
  await expect(page.locator('#groc-summary')).toContainText('Bought 3 of 3');
  await page.getByLabel('Got Oat milk').click(); // the box puts it back on Shopping
  await expect(view(page, 'Shopping')).toHaveText('Shopping 1');
  await page.reload();
  await expect(page).toHaveURL(/#\/daily\/grocery\/bought$/);
  await expect(view(page, 'Bought')).toHaveAttribute('aria-pressed', 'true'); // a reload reopens it
});

test('on Bought, Select all in a store then Change who shares applies after the sheet and Undo restores it', async ({ page }) => {
  await open(page);
  await view(page, 'Bought').click();
  await page.click('#groc-select');
  await expect(page.getByRole('button', { name: 'Select all 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Select all in Costco' }).click();
  await expect(page.getByRole('region', { name: 'Selected items' })).toContainText('2 selected');
  await page.getByRole('button', { name: 'Change who shares' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Share 2 items' })).toBeVisible();
  await sheet.getByLabel('Sam').check();
  await page.click('#bs-apply');
  await expect(page.getByText('Shared 2 items: Me +1.')).toBeVisible();
  await expect(page.locator('.gget', { hasText: 'Eggs' }).locator('.gsplittag')).toHaveText('Me +1');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.gget', { hasText: 'Eggs' }).locator('.gsplittag')).toHaveText('Me +2');
});

test('the old Groceries addresses open the renamed screens', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { location.hash = '#/daily/grocery/home'; });
  await expect(view(page, 'Inventory')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => { location.hash = '#/daily/grocery/get'; });
  await expect(view(page, 'Shopping')).toHaveAttribute('aria-pressed', 'true');
});

test('four segments fit at 320 px with large text and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await open(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(wide).toBe(false);
  for (const name of ['Shopping', 'Bought', 'Inventory', 'Spending']) {
    const box = await view(page, name).boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
});
