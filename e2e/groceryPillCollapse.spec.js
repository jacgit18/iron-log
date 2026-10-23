import { test, expect } from './fixtures.js';

// Two To get fixes. A row of a shared store shows its split by default, not only after it is changed; a store's Collapse all closes the rows
// already ticked bought too. The fixed date is in September 2026 (month 2026-09).
const item = (id, n, store, cents) => ({ id, n, store, qty: 1, cents, every: true, out: false });
const CATALOGUE = {
  stores: ["BJ's", 'Aldi'],
  items: [item('tp', 'Toilet paper', "BJ's", 2499), item('rice', 'Rice', "BJ's", 500), item('milk', 'Milk', 'Aldi', 300)],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom' }], stores: ["BJ's"] }],
};
const seed = async page => {
  await page.evaluate(({ CATALOGUE }) => {
    localStorage.setItem('ironlog:session/admin', 'true');
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE));
  }, { CATALOGUE });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-view-get');
};
const row = (page, name) => page.locator('li.gget', { has: page.getByLabel(`Got ${name}`, { exact: true }) });
const pill = (page, name) => page.getByRole('button', { name: `Count and price of ${name}` });

test('an item that follows its store’s group shows the split on the closed row without being changed', async ({ page }) => {
  await seed(page);
  await expect(row(page, 'Toilet paper').locator('.gsplittag')).toHaveText('Me +2');
  await expect(row(page, 'Rice').locator('.gsplittag')).toHaveText('Me +2');
  await expect(row(page, 'Milk').locator('.gsplittag')).toHaveCount(0); // a store with no group stays quiet: plain Just me is not said
});

test('Collapse all on a store also closes a row ticked bought while it was open', async ({ page }) => {
  await seed(page);
  await pill(page, 'Toilet paper').click();
  await pill(page, 'Rice').click();
  await page.locator('#groc-rice').check(); // moves to the Bought fold, still open
  const bought = page.locator('#groc-bought');
  await expect(bought.getByRole('button', { name: 'Count and price of Rice' })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: "Collapse all in BJ's" }).click();
  await expect(pill(page, 'Toilet paper')).toHaveAttribute('aria-expanded', 'false');
  await expect(bought.getByRole('button', { name: 'Count and price of Rice' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: "Expand all in BJ's" }).click();
  await expect(pill(page, 'Toilet paper')).toHaveAttribute('aria-expanded', 'true');
  await expect(bought.getByRole('button', { name: 'Count and price of Rice' })).toHaveAttribute('aria-expanded', 'true');
});
