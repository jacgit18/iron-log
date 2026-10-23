import { test, expect } from './fixtures.js';

// A count typed on To get this month becomes the item's usual count, so next month starts from it (the price and the split already carried).
// The fixed date is in September 2026.
const CATALOGUE = { stores: ["BJ's"], items: [{ id: 'rice', n: 'Rice', store: "BJ's", qty: 1, cents: 500, every: true, out: false }] };

test('a count changed on To get is the starting count next month', async ({ page }) => {
  await page.evaluate(({ CATALOGUE }) => { localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE)); }, { CATALOGUE });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-view-get');
  await page.getByRole('button', { name: /Count and price of Rice/i }).click();
  const count = page.getByLabel('Count of Rice');
  await count.fill('3');
  await count.blur();
  await expect(page.getByRole('button', { name: /^3 × .*count and price of Rice/i })).toBeVisible();
  await page.click('#groc-next');
  await expect(page.getByRole('button', { name: /^3 × .*count and price of Rice/i })).toBeVisible(); // next month starts at 3, not 1
});
