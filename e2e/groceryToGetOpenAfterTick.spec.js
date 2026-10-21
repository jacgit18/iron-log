import { test, expect } from './fixtures.js';

// Done-when B3: a To get row whose panel is open keeps it open when the item is ticked and moves down to Bought. The fixed date is in September 2026.
const item = (id, n, store, cents) => ({ id, n, store, qty: 1, cents, every: true, out: false });
const CATALOGUE = { stores: ["BJ's"], items: [item('tp', 'Toilet paper', "BJ's", 2499), item('rice', 'Rice', "BJ's", 500)] };
const seed = async page => {
  await page.evaluate(({ CATALOGUE }) => { localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE)); }, { CATALOGUE });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-view-get');
};
const pill = (page, name) => page.getByRole('button', { name: `Count and price of ${name}` });

test('an open panel stays open after the item is ticked and moves to Bought', async ({ page }) => {
  await seed(page);
  await pill(page, 'Rice').click();
  await expect(pill(page, 'Rice')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#groc-bought').getByLabel('Count of Rice')).toHaveCount(0);
  await page.locator('#groc-rice').check();
  await expect(page.locator('#groc-bought')).toHaveAttribute('open', ''); // the fold opens by itself, so the row can be finished in place
  const bought = page.locator('#groc-bought');
  await expect(bought.getByRole('button', { name: 'Count and price of Rice' })).toHaveAttribute('aria-expanded', 'true');
  await expect(bought.getByLabel('Count of Rice')).toBeVisible();
  await expect(pill(page, 'Toilet paper')).toHaveAttribute('aria-expanded', 'false'); // a panel that was shut is still shut
});
