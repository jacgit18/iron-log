import { test, expect } from './fixtures.js';

// Price and place history (brief grocery-price-history). The history rules are node tests (itemHistory.test.ts); this covers the wiring: the "Last:" line under an Inventory
// row, the sheet it opens, Close returning focus, and an item never bought having no line. The fixed date is in September 2026.
const CAT = { stores: ['Aldi', 'Costco'], items: [
  { id: 'eggs', n: 'Eggs', store: 'Aldi', qty: 1, cents: 300, every: true, out: false },
  { id: 'tea', n: 'Black tea', store: 'Aldi', qty: 1, cents: 400, every: true, out: false },
] };
const seed = async page => {
  await page.evaluate(cat => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(cat));
    localStorage.setItem('ironlog:grocery/2026-07', JSON.stringify({ lines: { eggs: { got: true, cents: 379 } }, pulled: [] }));
    localStorage.setItem('ironlog:grocery/2026-08', JSON.stringify({ lines: { eggs: { got: true, cents: 299, store: 'Costco', qty: 2 } }, pulled: [] }));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify({ lines: {}, pulled: [] }));
  }, CAT);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-inventory');
};

test('a bought item shows its last price and store, an item never bought shows none, and the line opens the sheet', async ({ page }) => {
  await page.goto('/');
  await seed(page);
  const line = page.locator('#groc-history-eggs');
  await expect(line).toHaveText('Last: $2.99 at Costco, Aug');
  await expect(page.locator('#groc-history-tea')).toHaveCount(0);
  await line.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Eggs' })).toBeVisible();
  await expect(sheet.getByText('$3.39')).toBeVisible(); // average of $2.99 and $3.79
  await expect(sheet.getByText('Bought most often at')).toBeVisible();
  await expect(sheet.locator('.phrow')).toHaveCount(2);
  await expect(sheet.getByText('Cheapest')).toHaveCount(1);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(line).toBeFocused();
});
