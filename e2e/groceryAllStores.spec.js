import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// A sharing group set to All stores splits every store with no group of its own, and the month shows one amount per person over the stores (the cards stay).
// The fixed date is in September 2026. $30.00 at BJ's (you paid) and $9.00 at Aldi (Sister paid), both split three ways with Sister and Mom:
// Sister owes you $10.00 at BJ's and you owe her $3.00 at Aldi, so Sister owes $7.00 overall; Mom owes you $10.00.
const group = allStores => ({ id: 'g1', n: 'Family', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom' }], stores: [], ...(allStores ? { allStores: true } : {}) });
const catalogue = allStores => ({
  stores: ["BJ's", 'Aldi'],
  items: [{ id: 'tp', n: 'Toilet paper', store: "BJ's", qty: 1, cents: 3000, every: true, out: false }, { id: 'rice', n: 'Rice', store: 'Aldi', qty: 1, cents: 900, every: true, out: false }],
  groups: [group(allStores)],
});
const MONTH = { lines: { tp: { got: true }, rice: { got: true } }, pulled: [], payer: { Aldi: 'sis' } };
const seed = async (page, allStores) => {
  const month = allStores ? MONTH : { ...MONTH, payer: undefined }; // with no one sharing, a bill Sister paid would be all yours to repay, which is a row to net
  await page.evaluate(({ c, MONTH }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(c));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(MONTH));
  }, { c: catalogue(allStores), MONTH: month });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
};
const openSplit = page => page.getByRole('button', { name: /^Splitting this month/ }).click();
const block = page => page.getByRole('region', { name: 'Across all stores' });

test('with All stores on, the block nets each person over both stores and the cards stay', async ({ page }) => {
  await seed(page, true);
  await openSplit(page);
  await expect(block(page)).toBeVisible();
  await expect(block(page)).toContainText('Sister owes you');
  await expect(block(page)).toContainText("BJ's $10.00, Aldi −$3.00");
  await expect(block(page).locator('li').nth(0)).toContainText('$7.00');
  await expect(block(page).locator('li').nth(1)).toContainText('Mom owes you');
  await expect(block(page)).toContainText('Net $17.00 owed to you');
  await expect(page.locator('.gsplitcard')).toHaveCount(2); // the store cards are still there
  const results = await new AxeBuilder({ page }).include('.gacross').analyze();
  expect(results.violations).toEqual([]);
});

test('with All stores off the stores have no group, so there is nothing to net and no block', async ({ page }) => {
  await seed(page, false);
  await openSplit(page);
  await expect(page.locator('.gsplitcard')).toHaveCount(2); // the cards are there, with nothing shared
  await expect(block(page)).toHaveCount(0);
});

test('the Sharing panel switches a group between All stores and Only these stores', async ({ page }) => {
  await seed(page, false);
  await page.evaluate(() => localStorage.setItem('ironlog:session/admin', 'true'));
  await page.click('#groc-view-home');
  await page.click('#groc-sharing');
  const all = page.getByRole('radio', { name: 'All stores' });
  await expect(page.getByRole('radio', { name: 'Only these stores' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: "BJ's" })).toBeVisible();
  await all.check();
  await expect(all).toBeChecked();
  await expect(page.getByRole('checkbox', { name: "BJ's" })).toHaveCount(0); // the per-store boxes hide while every store follows the group
  await page.getByRole('radio', { name: 'Only these stores' }).check();
  await expect(page.getByRole('checkbox', { name: "BJ's" })).toBeVisible();
});
