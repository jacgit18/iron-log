import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Quieter share controls (grocery sharing, ADR 059). A row says how it is split on the closed To get row only when it differs from its
// store's group, and while editing a store's rows show their share controls only after "Adjust shares for <store>" (or when the item has its own split).
// The fixed date is in September 2026, so the month below is 2026-09.
const item = (id, n, store, cents, share) => ({ id, n, store, qty: 1, cents, every: true, out: false, ...(share ? { share } : {}) });
const CATALOGUE = {
  stores: ["BJ's", 'Aldi'],
  items: [item('tp', 'Toilet paper', "BJ's", 2499), item('chicken', 'Chicken', "BJ's", 0), item('rice', 'Rice', "BJ's", 500, { with: ['sis'] })],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom' }], stores: ["BJ's"] }],
};
const MONTH = { lines: { tp: { got: true }, rice: { got: true }, chicken: { got: true, prices: [1049, 925], packShares: [{ with: [] }, null] } }, pulled: [] };

const seed = async page => {
  await page.evaluate(({ CATALOGUE, MONTH }) => {
    localStorage.setItem('ironlog:session/admin', 'true');
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(MONTH));
  }, { CATALOGUE, MONTH });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
};
const row = (page, name) => page.locator('li.gget', { has: page.getByLabel(`Got ${name}`, { exact: true }) });

test('a closed row says how it is split only when it differs from the store’s group', async ({ page }) => {
  await seed(page);
  await page.click('#groc-bought summary');
  await expect(row(page, 'Toilet paper').locator('.gsplittag')).toHaveCount(0); // follows BJ's group
  await expect(row(page, 'Rice').locator('.gsplittag')).toHaveText('Me +1'); // its own split
  await expect(row(page, 'Chicken').locator('.gsplittag')).toHaveText('Packs split');
});

test('while editing, a store’s rows show share controls only after Adjust shares, or when the item has its own split', async ({ page }) => {
  await seed(page);
  await page.click('#groc-view-home'); await page.click('#groc-edit');
  await expect(page.getByLabel(/Shared with, for Toilet paper/)).toHaveCount(0);
  await expect(page.getByLabel(/Shared with, for Chicken/)).toHaveCount(0);
  await expect(page.getByLabel(/Shared with, for Rice/)).toHaveCount(1); // item with its own split keeps its control
  await page.getByRole('button', { name: "Adjust shares for BJ's" }).click();
  await expect(page.getByLabel(/Shared with, for Toilet paper/)).toHaveCount(1);
  await expect(page.getByLabel(/Shared with, for Chicken/)).toHaveCount(1);
  await page.getByRole('button', { name: "Done adjusting BJ's" }).click();
  await expect(page.getByLabel(/Shared with, for Toilet paper/)).toHaveCount(0);
});

test('Adjust shares is offered only when a group exists, and the edit screen has no accessibility violations', async ({ page }) => {
  await seed(page);
  await page.click('#groc-view-home'); await page.click('#groc-edit');
  await page.getByRole('button', { name: "Adjust shares for BJ's" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('ironlog:grocery/main')); delete c.groups; localStorage.setItem('ironlog:grocery/main', JSON.stringify(c)); });
  await page.reload(); await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-home'); await page.click('#groc-edit');
  await expect(page.getByRole('button', { name: /Adjust shares for/ })).toHaveCount(0);
});
