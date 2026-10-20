import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// A store's sales tax (a Tax checkbox and a percent in At home > Edit > Stores): it is added to what is bought at that store so the totals match
// the receipt. The fixed date is in September 2026, so the month below is 2026-09.
const CAT = { stores: ["BJ's", 'Aldi'], items: [
  { id: 'tp', n: 'Toilet paper', store: "BJ's", qty: 1, cents: 2499, every: true, out: false },
  { id: 'rice', n: 'Rice', store: 'Aldi', qty: 1, cents: 500, every: true, out: false },
] };
const MONTH = { lines: { tp: { got: true }, rice: { got: true } }, pulled: [] };

const seed = async (page, cat = CAT) => {
  await page.evaluate(({ cat, MONTH }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(cat));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(MONTH));
  }, { cat, MONTH });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
};
const toEdit = async page => { await page.click('#groc-view-home'); await page.click('#groc-edit'); };
const setTax = async (page, store, pct) => {
  await page.getByLabel(`Charges tax at ${store}`).check();
  await page.getByLabel(`Tax rate at ${store}, percent`).fill(pct);
  await page.getByLabel(`Tax rate at ${store}, percent`).press('Enter');
};

test('a store\'s tax is added to what you spent there and nowhere else, and it survives a reload', async ({ page }) => {
  await seed(page);
  await expect(page.locator('#groc-summary')).toContainText('Spent $29.99'); // 24.99 + 5.00, no tax yet
  await toEdit(page);
  await setTax(page, "BJ's", '8.875');
  await page.click('#groc-done'); await page.click('#groc-view-get');
  await expect(page.locator('#groc-summary')).toContainText('Spent $32.21'); // BJ's 24.99 + 2.22 tax, Aldi 5.00 untaxed
  await expect(page.locator('#groc-summary')).toContainText('with tax');
  await page.reload(); await page.click('#tab-daily'); await page.click('#daily-grocery');
  await expect(page.locator('#groc-summary')).toContainText('Spent $32.21');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/main')).taxes);
  expect(saved).toEqual({ "BJ's": 8875 });
});

test('unticking Tax takes the tax off again', async ({ page }) => {
  await seed(page, { ...CAT, taxes: { "BJ's": 8875 } });
  await expect(page.locator('#groc-summary')).toContainText('Spent $32.21');
  await toEdit(page);
  await expect(page.getByLabel("Tax rate at BJ's, percent")).toHaveValue('8.875');
  await page.getByLabel("Charges tax at BJ's").uncheck();
  await page.click('#groc-done'); await page.click('#groc-view-get');
  await expect(page.locator('#groc-summary')).toContainText('Spent $29.99');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/main')).taxes)).toBeUndefined();
});

test('a rate that is not a percent is refused with a message and nothing is saved', async ({ page }) => {
  await seed(page);
  await toEdit(page);
  await setTax(page, "BJ's", 'abc');
  await expect(page.getByRole('alert')).toContainText('Tax is a percent');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/main')).taxes)).toBeUndefined();
});

test('the Stores section with a tax box has no accessibility violations', async ({ page }) => {
  await seed(page, { ...CAT, taxes: { "BJ's": 8875 } });
  await toEdit(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('with sharing, the bill and the store line show the tax, and the card says it is included', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ironlog:session/admin', 'true'));
  await seed(page, {
    stores: ["BJ's"], items: [{ id: 'tp', n: 'Toilet paper', store: "BJ's", qty: 1, cents: 2499, every: true, out: false }],
    groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }], stores: ["BJ's"] }], taxes: { "BJ's": 8875 },
  });
  await page.click('#groc-view-get');
  const card = page.getByRole('region', { name: 'Splitting this month' }).locator('.gsplitcard', { hasText: "BJ's" });
  await expect(card.locator('li', { hasText: 'Bill' }).first()).toContainText('$27.21'); // 24.99 + 2.22
  await expect(card.locator('li', { hasText: 'Includes tax' })).toContainText('$2.22');
  await page.click('#groc-bought summary');
  await expect(page.locator('.gstoremoney')).toContainText('Bought $27.21 (tax $2.22)');
  // Your share and your sister's add up to the bill (27.21): 24.99 splits 12.49 / 12.50, and the 2.22 tax follows each person's share, 1.11 each.
  await expect(card.locator('li', { hasText: 'Your share' })).toContainText('$13.60');
  await expect(card.locator('li', { hasText: 'Sister owes you' })).toContainText('$13.61');
});
