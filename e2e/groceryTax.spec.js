import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// A store's tax for the month, typed in dollars from the receipt (a Tax checkbox and an amount under the store's name on To get). It is added to what
// you spent there, and the percent it comes to on the ticked items is shown beside it. The fixed date is in September 2026 (month 2026-09).
const CAT = { stores: ["BJ's", 'Aldi'], items: [
  { id: 'tp', n: 'Toilet paper', store: "BJ's", qty: 1, cents: 2499, every: true, out: false },
  { id: 'soap', n: 'Soap', store: "BJ's", qty: 1, cents: 400, every: true, out: false },
  { id: 'rice', n: 'Rice', store: 'Aldi', qty: 1, cents: 500, every: true, out: false },
] };
const MONTH = { lines: { tp: { got: true }, rice: { got: true } }, pulled: [] }; // soap still to get, so BJ's has a to-get section

const seed = async (page, { cat = CAT, month = MONTH, admin = false } = {}) => {
  await page.evaluate(({ cat, month, admin }) => {
    if (admin) localStorage.setItem('ironlog:session/admin', 'true');
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(cat));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(month));
  }, { cat, month, admin });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
};
const section = (page, store) => page.locator('section.gstore', { has: page.getByRole('heading', { name: store }) }).first();
const setTax = async (page, store, amount) => {
  await page.getByLabel(`Tax at ${store} this month`).check();
  const box = page.getByLabel(`Tax at ${store}, dollars, from the receipt`);
  await box.fill(amount); await box.press('Enter');
};

test('a typed tax is added to what you spent at that store, shows its percent, and survives a reload', async ({ page }) => {
  await seed(page);
  await expect(page.locator('#groc-summary')).toContainText('Spent $29.99'); // 24.99 + 5.00, no tax yet
  await setTax(page, "BJ's", '2.22');
  await expect(page.locator('#groc-summary')).toContainText('Spent $32.21 with tax');
  await expect(section(page, "BJ's").locator('.gtaxpct')).toHaveText('8.88% of $24.99'); // 2.22 / 24.99 = 8.8836
  await page.reload(); await page.click('#tab-daily'); await page.click('#daily-grocery');
  await expect(page.locator('#groc-summary')).toContainText('Spent $32.21 with tax');
  await expect(page.getByLabel("Tax at BJ's, dollars, from the receipt")).toHaveValue('2.22');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/2026-09')).tax)).toEqual({ "BJ's": 222 });
});

test('the tax box is offered once something is ticked at the store, and unticking Tax clears it', async ({ page }) => {
  await seed(page, { month: { lines: { rice: { got: true } }, pulled: [] } }); // nothing ticked at BJ's yet
  await expect(page.getByLabel("Tax at BJ's this month")).toHaveCount(0);
  await page.click('#groc-bought summary'); // Aldi is all bought, so its section is in the fold
  await expect(page.getByLabel('Tax at Aldi this month')).toBeVisible();
  await setTax(page, 'Aldi', '0.35');
  await expect(page.locator('#groc-summary')).toContainText('Spent $5.35 with tax');
  await page.getByLabel('Tax at Aldi this month').uncheck();
  await expect(page.locator('#groc-summary')).toContainText('Spent $5.00');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/2026-09')).tax)).toBeUndefined();
});

test('an amount that is not dollars is refused with a message and nothing is saved', async ({ page }) => {
  await seed(page);
  await setTax(page, "BJ's", 'abc');
  await expect(page.getByRole('alert')).toContainText('Tax is dollars');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/2026-09')).tax)).toBeUndefined();
});

test('with sharing, the bill shows the tax and every share still adds up to it', async ({ page }) => {
  await seed(page, {
    admin: true,
    cat: { stores: ["BJ's"], items: [{ id: 'tp', n: 'Toilet paper', store: "BJ's", qty: 1, cents: 2499, every: true, out: false }],
      groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }], stores: ["BJ's"] }] },
    month: { lines: { tp: { got: true } }, pulled: [], tax: { "BJ's": 222 } },
  });
  const card = page.getByRole('region', { name: 'Splitting this month' }).locator('.gsplitcard', { hasText: "BJ's" });
  await expect(card.locator('li', { hasText: 'Bill' }).first()).toContainText('$27.21'); // 24.99 + 2.22
  await expect(card.locator('li', { hasText: 'Includes tax' })).toContainText('$2.22');
  await page.click('#groc-bought summary');
  await expect(page.locator('.gstoremoney')).toContainText('Bought $27.21 (tax $2.22)');
  // 24.99 splits 12.49 / 12.50 and the 2.22 follows each person's share, 1.11 each.
  await expect(card.locator('li', { hasText: 'Your share' })).toContainText('$13.60');
  await expect(card.locator('li', { hasText: 'Sister owes you' })).toContainText('$13.61');
});

test('the tax box has no accessibility violations', async ({ page }) => {
  await seed(page, { month: { ...MONTH, tax: { "BJ's": 222 } } });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

// Another device or tab writes the month (sync, Add to my data): the box and the summary follow it instead of keeping what they were showing.
const writeMonth = (page, month) => page.evaluate(m => {
  const key = 'ironlog:grocery/2026-09'; const value = JSON.stringify(m); localStorage.setItem(key, value);
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));
}, month);

test('a tax changed elsewhere shows in the box, and one cleared elsewhere is not written back', async ({ page }) => {
  await seed(page);
  await expect(page.getByLabel("Tax at BJ's this month")).not.toBeChecked();
  await writeMonth(page, { ...MONTH, tax: { "BJ's": 222 } });
  await expect(page.getByLabel("Tax at BJ's this month")).toBeChecked();
  await expect(page.getByLabel("Tax at BJ's, dollars, from the receipt")).toHaveValue('2.22');
  await expect(page.locator('#groc-summary')).toContainText('Spent $32.21 with tax');
  await writeMonth(page, MONTH); // cleared on the other device
  await expect(page.getByLabel("Tax at BJ's this month")).not.toBeChecked();
  await expect(page.locator('#groc-summary')).toContainText('Spent $29.99');
  await page.getByLabel("Tax at BJ's this month").check();
  await page.getByLabel("Tax at BJ's, dollars, from the receipt").press('Tab'); // leaving an empty box saves nothing
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/2026-09')).tax)).toBeUndefined();
});

test('"with tax" is only said when a tax is counted: a tax at a store with nothing ticked is not', async ({ page }) => {
  await seed(page, { month: { lines: { tp: { got: true } }, pulled: [], tax: { Aldi: 35 } } }); // Aldi has a tax typed but nothing ticked
  await expect(page.locator('#groc-summary')).toContainText('Spent $24.99');
  await expect(page.locator('#groc-summary')).not.toContainText('with tax');
});
