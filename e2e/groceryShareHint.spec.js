import { test, expect } from './fixtures.js';

// A share set from the Ahead view (a month to plan) becomes the item's usual, so it also changes this month's items that are not bought yet (audit M-03):
// the hint says so instead of promising only "next month". The fixed date is in September 2026.
const CATALOGUE = {
  stores: ["BJ's"],
  items: [{ id: 'chicken', n: 'Chicken', store: "BJ's", qty: 1, cents: 900, every: true, out: false }],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom' }], stores: ["BJ's"] }],
};
const seed = async page => {
  await page.evaluate(({ CATALOGUE }) => { localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE)); }, { CATALOGUE });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
};

test('this month the hint says the share carries to next month; in a month ahead it says it also changes this month’s unbought items', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: /^Chicken/ }).first().click();
  await page.getByLabel(/Shared with, for Chicken/).click();
  await page.getByLabel('Mom').uncheck();
  await expect(page.getByText('Saved as the usual for next month too.')).toBeVisible();
  await page.click('#groc-next'); // another month starts with its rows folded (audit N-14)
  await expect(page.getByLabel(/Shared with, for Chicken/)).toHaveCount(0);
  await page.getByRole('button', { name: /^Chicken/ }).first().click();
  await page.getByLabel(/Shared with, for Chicken/).click();
  await page.getByLabel('Sister').uncheck();
  await expect(page.getByText('Saved as the usual from now on: it also changes this month’s items you have not bought yet.')).toBeVisible();
  await expect(page.getByText('Saved as the usual for next month too.')).toHaveCount(0);
});
