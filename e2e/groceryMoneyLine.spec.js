import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// The shared-grocery money where you shop (sharing, ADR 059): a line under a shared store's heading. The month's line over the Bought list went in brief groceries-bought-inventory-lists;
// the paid, share and owed numbers it showed are asserted below from the Who owes who card, which is now the only place for them.
// The fixed date is in September 2026, so the month below is 2026-09.
const item = (id, n, store, cents) => ({ id, n, store, qty: 1, cents, every: true, out: false });
const CATALOGUE = {
  stores: ["BJ's", 'Aldi'],
  items: [item('tp', 'Toilet paper', "BJ's", 2499), item('chicken', 'Chicken', "BJ's", 0), item('rice', 'Rice', 'Aldi', 500), item('soap', 'Soap', "BJ's", 400)],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom', covered: true }], stores: ["BJ's"] }],
};
const MONTH = { lines: { tp: { got: true }, chicken: { got: true, prices: [1049, 925, 899], packShares: [{ with: [] }, { with: [] }, null] }, rice: { got: true } }, pulled: [] };
const BJS = "Bought $53.72 · Your share $31.06 · Owed to you $11.33";

const seed = async (page, { admin = true, soapGot = false, payer = null } = {}) => {
  await page.evaluate(({ admin, soapGot, payer, CATALOGUE, MONTH }) => {
    if (admin) localStorage.setItem('ironlog:session/admin', 'true');
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify({ ...(soapGot ? { ...MONTH, lines: { ...MONTH.lines, soap: { got: true } } } : MONTH), ...(payer ? { payer } : {}) }));
  }, { admin, soapGot, payer, CATALOGUE, MONTH });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-bought'); // the money line and Who owes who live on Bought
};

// The card's summary: a term and its amount.
const sum = (page, name) => page.getByRole('region', { name: 'Who owes who' }).getByText(name, { exact: true }).locator('xpath=following-sibling::dd');

test('there is no money line under the month switcher; Who owes who is the one place for what you paid, your share and what is owed to you', async ({ page }) => {
  await seed(page);
  await expect(page.locator('#groc-money')).toHaveCount(0);
  await page.getByRole('button', { name: /^Who owes who/ }).click();
  await expect(sum(page, 'Paid')).toHaveText('$58.72');
  await expect(sum(page, 'Your share')).toHaveText('$36.06');
  await expect(sum(page, 'Still owed to you')).toHaveText('$11.33');
});

test('when someone else paid BJ\'s the card says what you still owe instead of a $0.00 owed to you', async ({ page }) => {
  await seed(page, { payer: { "BJ's": 'mom' } });
  await page.getByRole('button', { name: /^Who owes who/ }).click();
  await expect(sum(page, 'Paid')).toHaveText('$5.00');
  await expect(sum(page, 'Your share')).toHaveText('$36.06');
  await expect(sum(page, 'You still owe')).toHaveText('$31.06');
});

test('a shared store with things still to get shows its money under its heading, once, and a solo store shows none', async ({ page }) => {
  await seed(page);
  await expect(page.locator('.gstoremoney')).toHaveCount(1);
  await expect(page.locator('section.gstore', { has: page.getByRole('heading', { name: /BJ's/ }) }).first().locator('.gstoremoney')).toHaveText(BJS);
  await page.click('#groc-view-bought');
  await expect(page.locator('.gstoremoney')).toHaveCount(1); // the fold's BJ's heading does not repeat it
});

test('a shared store with nothing left to get shows its money on Bought', async ({ page }) => {
  await seed(page, { soapGot: true });
  await page.click('#groc-view-shopping');
  await expect(page.locator('.gstoremoney')).toHaveCount(0); // that store has nothing left to get, so Shopping has no card for it
  await page.click('#groc-view-bought');
  await expect(page.locator('.gstoremoney')).toBeVisible();
});

test('with no group there is no money line, and the page has no accessibility violations with it', async ({ page }) => {
  await seed(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('ironlog:grocery/main')); delete g.groups; localStorage.setItem('ironlog:grocery/main', JSON.stringify(g)); });
  await page.reload(); await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-bought'); // the money line and Who owes who live on Bought
  await expect(page.locator('#groc-money')).toHaveCount(0);
  await expect(page.locator('.gstoremoney')).toHaveCount(0);
});
