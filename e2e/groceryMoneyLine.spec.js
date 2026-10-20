import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// The shared-grocery money where you shop (admin-only sharing, ADR 059): one line over the To get list and a line under a shared store's heading.
// The fixed date is in September 2026, so the month below is 2026-09.
const item = (id, n, store, cents) => ({ id, n, store, qty: 1, cents, every: true, out: false });
const CATALOGUE = {
  stores: ["BJ's", 'Aldi'],
  items: [item('tp', 'Toilet paper', "BJ's", 2499), item('chicken', 'Chicken', "BJ's", 0), item('rice', 'Rice', 'Aldi', 500), item('soap', 'Soap', "BJ's", 400)],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom', covered: true }], stores: ["BJ's"] }],
};
const MONTH = { lines: { tp: { got: true }, chicken: { got: true, prices: [1049, 925, 899], packShares: [{ with: [] }, { with: [] }, null] }, rice: { got: true } }, pulled: [] };
const BJS = "Bought $53.72 · Your share $31.06 · Owed to you $11.33";

const seed = async (page, { admin = true, soapGot = false } = {}) => {
  await page.evaluate(({ admin, soapGot, CATALOGUE, MONTH }) => {
    if (admin) localStorage.setItem('ironlog:session/admin', 'true');
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(soapGot ? { ...MONTH, lines: { ...MONTH.lines, soap: { got: true } } } : MONTH));
  }, { admin, soapGot, CATALOGUE, MONTH });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
};

test('one line over the list says what you paid, your share and what is owed to you', async ({ page }) => {
  await seed(page);
  await expect(page.locator('#groc-money')).toHaveText('Paid $58.72 · Your share $36.06 · Owed to you $11.33');
});

test('a shared store with things still to get shows its money under its heading, once, and a solo store shows none', async ({ page }) => {
  await seed(page);
  await expect(page.locator('.gstoremoney')).toHaveCount(1);
  await expect(page.locator('section.gstore', { has: page.getByRole('heading', { name: /BJ's/ }) }).first().locator('.gstoremoney')).toHaveText(BJS);
  await page.click('#groc-bought summary');
  await expect(page.locator('.gstoremoney')).toHaveCount(1); // the fold's BJ's heading does not repeat it
});

test('a shared store with nothing left to get shows its money in the Bought this month fold', async ({ page }) => {
  await seed(page, { soapGot: true });
  await expect(page.locator('.gstoremoney')).toBeHidden(); // inside the folded section
  await page.click('#groc-bought summary');
  await expect(page.locator('.gstoremoney')).toBeVisible();
});

test('without sharing there is no money line, and the page has no accessibility violations with it', async ({ page }) => {
  await seed(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => localStorage.removeItem('ironlog:session/admin'));
  await page.reload(); await page.click('#tab-daily'); await page.click('#daily-grocery');
  await expect(page.locator('#groc-money')).toHaveCount(0);
  await expect(page.locator('.gstoremoney')).toHaveCount(0);
});
