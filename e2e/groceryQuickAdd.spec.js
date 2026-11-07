import { test, expect } from './fixtures.js';

// Quick add on Shopping (brief groceries-spending-buttons-quick-add): a `+ Add item to <store>` row creates a one-time item, with a notice to make it every month or undo it.
// The add logic and the refusals are node tests (groceryQuickAdd.test.ts, groceryQuickAddStore.test.ts); this covers the row, the field, the notice and the item showing on Shopping, Inventory and the chips: wiring across two pages and the store that a unit test cannot reach.
const CATALOGUE = {
  stores: ['Aldi', 'Costco'],
  items: [
    { id: 'eggs', n: 'Eggs', store: 'Costco', qty: 1, cents: 1000, every: true, out: false },
    { id: 'rice', n: 'Rice', store: 'Aldi', qty: 1, cents: 500, every: true, out: false },
  ],
};
const open = async page => {
  await page.evaluate(CATALOGUE => localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE)), CATALOGUE);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-view-shopping');
};
const row = (page, store) => page.getByRole('button', { name: `Add item to ${store}` });
const add = async (page, store, name) => { await row(page, store).click(); await page.getByLabel(`Item name, to add to ${store}`).fill(name); await page.keyboard.press('Enter'); };

test('+ Add item to a store adds a one-time item to that store, with a notice', async ({ page }) => {
  await open(page);
  await add(page, 'Costco', 'Milk');
  const costco = page.locator('section.gstore', { has: page.getByRole('heading', { name: 'Costco' }) });
  await expect(costco.getByLabel('Got Milk')).toBeVisible();
  await expect(page.locator('section.gstore', { has: page.getByRole('heading', { name: 'Aldi' }) }).getByLabel('Got Milk')).toHaveCount(0);
  await expect(page.getByText('Added Milk to Costco. It is a one-time item and stays in Inventory.')).toBeVisible();
  await expect(row(page, 'Costco')).toBeVisible(); // the field closed; the row is back
});

test('Make it every month changes the notice, and Undo removes the item', async ({ page }) => {
  await open(page);
  await add(page, 'Aldi', 'Milk');
  await page.getByRole('button', { name: 'Make it every month' }).click();
  await expect(page.getByText('Milk is now an every-month item in Aldi.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make it every month' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Got Milk')).toHaveCount(0);
  await page.click('#groc-view-inventory');
  await expect(page.getByText('Milk', { exact: true })).toHaveCount(0);
});

test('a duplicate name and an empty name show the usual messages and keep the field open; Escape cancels', async ({ page }) => {
  await open(page);
  await row(page, 'Aldi').click();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Give the item a name.');
  await page.getByLabel('Item name, to add to Aldi').fill('rice');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('That item is already in this store’s list.');
  await page.keyboard.press('Escape');
  await expect(row(page, 'Aldi')).toBeFocused();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the item is in Inventory and the chip counts, and survives a reload', async ({ page }) => {
  await open(page);
  await add(page, 'Costco', 'Milk');
  await expect(page.locator('.gstorechips').getByRole('button', { name: /Costco/ })).toContainText('2');
  await page.reload();
  await expect(page.getByLabel('Got Milk')).toBeVisible();
  await page.click('#groc-view-inventory');
  await expect(page.getByText('Milk', { exact: true })).toBeVisible();
});

test('in a store chip view the row adds to that store', async ({ page }) => {
  await open(page);
  await page.locator('.gstorechips').getByRole('button', { name: /Aldi/ }).click();
  await add(page, 'Aldi', 'Salt');
  await expect(page.getByLabel('Got Salt')).toBeVisible();
  await page.click('#groc-view-inventory');
  await expect(page.locator('section.gstore', { has: page.getByRole('heading', { name: 'Aldi' }) }).getByText('Salt', { exact: true })).toBeVisible();
});
