import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Who owes who shows every person's month over all stores (brief group-share-across-stores): Paid and Share, you first, an All row that is the bills.
// $30.00 at BJ's (you paid) and $9.00 at Aldi (Sister paid), split three ways with Sister and Mom: $13.00 each.
const catalogue = {
  stores: ["BJ's", 'Aldi'],
  items: [{ id: 'tp', n: 'Toilet paper', store: "BJ's", qty: 1, cents: 3000, every: true, out: false }, { id: 'rice', n: 'Rice', store: 'Aldi', qty: 1, cents: 900, every: true, out: false }],
  groups: [{ id: 'g1', n: 'Family', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom' }], stores: [], allStores: true }],
};
const MONTH = { lines: { tp: { got: true }, rice: { got: true } }, pulled: [], payer: { Aldi: 'sis' } };
const seed = async (page, c = catalogue, month = MONTH) => {
  await page.evaluate(({ c, month }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(c));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(month));
  }, { c, month });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-view-bought'); await page.getByRole('button', { name: /^Who owes who/ }).click();
};
const table = page => page.getByRole('table', { name: 'Everyone across all stores' });
const cells = async row => (await row.locator('th,td').allTextContents()).map(t => t.trim());

test('the table gives each person Paid and Share over both stores, with an All row that is the bills', async ({ page }) => {
  await seed(page);
  await expect(table(page)).toBeVisible();
  const rows = table(page).locator('tbody tr');
  expect(await cells(rows.nth(0))).toEqual(['You', '$30.00', '$13.00']);
  expect(await cells(rows.nth(1))).toEqual(['Sister', '$9.00', '$13.00']);
  expect(await cells(rows.nth(2))).toEqual(['Mom', '$0.00', '$13.00']);
  expect(await cells(rows.nth(3))).toEqual(['All', '$39.00', '$39.00']);
  const results = await new AxeBuilder({ page }).include('.gacross').analyze();
  expect(results.violations).toEqual([]);
});

test('Mark paid does not change the table', async ({ page }) => {
  await seed(page);
  const all = async () => Promise.all((await table(page).locator('tbody tr').all()).map(cells));
  const before = await all();
  expect(before).toHaveLength(4); // three people and the All row, so the comparison is not of nothing
  await page.getByRole('button', { name: /^Mark paid/ }).first().click();
  await expect(table(page)).toBeVisible();
  expect(await all()).toEqual(before);
});

test('one store bought from shows no table', async ({ page }) => {
  await seed(page, catalogue, { lines: { tp: { got: true } }, pulled: [] });
  await expect(table(page)).toHaveCount(0);
});
