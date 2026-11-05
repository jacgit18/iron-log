import { test, expect } from './fixtures.js';

// Select mode on To get (brief grocery-bulk-share): pick many items, set who shares them once, Undo. The fixed date is in September 2026.
const CATALOGUE = {
  stores: ['Costco', "Trader Joe's"],
  items: [
    { id: 'eggs', n: 'Eggs', store: 'Costco', qty: 1, cents: 899, every: true, out: false },
    { id: 'beef', n: 'Beef roast', store: 'Costco', qty: 1, cents: 1599, every: true, out: false },
    { id: 'oat', n: 'Oat milk', store: "Trader Joe's", qty: 1, cents: 349, every: true, out: false },
  ],
  groups: [{ id: 'g1', n: 'Home', people: [{ id: 'sam', n: 'Sam' }, { id: 'alex', n: 'Alex' }], stores: ['Costco'] }],
};
const MONTH = { lines: { beef: { prices: [799, 800], packShares: [{ with: ['sam'] }, null] } }, pulled: [] };
const stored = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem('ironlog:' + k) || 'null'), key);
const open = async (page, catalogue = CATALOGUE) => {
  await page.evaluate(({ catalogue, MONTH }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(catalogue));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(MONTH));
  }, { catalogue, MONTH });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
};
const tag = (page, name) => page.locator('.gget', { hasText: name }).locator('.gsplittag');

test('select all in a store, share with one person, the split tags follow, and Undo restores them', async ({ page }) => {
  await open(page);
  await expect(tag(page, 'Eggs')).toHaveText('Me +2');
  await page.click('#groc-select');
  await expect(page.getByRole('button', { name: 'Select all in Costco' })).toBeVisible();
  await expect(page.locator('#groc-select-share')).toBeDisabled();
  await page.getByRole('button', { name: 'Select all in Costco' }).click();
  await expect(page.getByRole('region', { name: 'Selected items' })).toContainText('2 selected');
  await page.click('#groc-select-share');
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Share 2 items' })).toBeVisible();
  await expect(sheet).toContainText('1 picked item is priced pack by pack: every pack gets this split.');
  await sheet.getByLabel('Sam').check();
  await page.click('#bs-apply');
  await expect(page.getByText('Shared 2 items: Me +1.')).toBeVisible();
  await expect(page.locator('#groc-select')).toBeFocused();
  await expect(tag(page, 'Eggs')).toHaveText('Me +1');
  await expect(tag(page, 'Beef roast')).toHaveText('Me +1'); // every pack has it now
  const lines = (await stored(page, 'grocery/2026-09')).lines;
  expect(lines.beef.packShares).toBeUndefined();
  expect(lines.eggs.share).toEqual({ with: ['sam'] });
  expect((await stored(page, 'grocery/main')).items.find(i => i.id === 'eggs').share).toBeUndefined(); // this month only: the usual is unchanged
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(tag(page, 'Eggs')).toHaveText('Me +2');
  await expect(tag(page, 'Beef roast')).toHaveText('Packs split');
  expect((await stored(page, 'grocery/2026-09')).lines.beef.packShares).toEqual([{ with: ['sam'] }, null]);
});

test('the usual box changes the item’s usual split on At home, and Done selecting clears the picks', async ({ page }) => {
  await open(page);
  await page.click('#groc-select');
  await page.getByLabel('Select Eggs').check();
  await page.click('#groc-select-share');
  await page.getByRole('dialog').getByLabel('Alex').check();
  await page.getByRole('dialog').getByLabel('Also make this the usual split for these items').check();
  await page.click('#bs-apply');
  await expect(page.getByText('Shared 1 item: Me +1.')).toBeVisible();
  await expect.poll(() => stored(page, 'grocery/main').then(g => g.items.find(i => i.id === 'eggs').share)).toEqual({ with: ['alex'] });
  await page.click('#groc-select');
  await page.getByLabel('Select Oat milk').check();
  await page.click('#groc-select'); // Done selecting
  await page.click('#groc-select');
  await expect(page.getByRole('region', { name: 'Selected items' })).toContainText('0 selected');
});

test('Back closes the sheet, and with no sharing group there is no Select button', async ({ page }) => {
  await open(page);
  const before = page.url();
  await page.click('#groc-select');
  await page.getByLabel('Select Eggs').check();
  await page.click('#groc-select-share');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(page.url()).toBe(before);
  await page.evaluate(({ c }) => localStorage.setItem('ironlog:grocery/main', JSON.stringify({ ...c, groups: [] })), { c: CATALOGUE });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await expect(page.locator('#groc-select')).toHaveCount(0);
});
