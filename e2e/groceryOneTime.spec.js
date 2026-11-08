import { test, expect } from './fixtures.js';

// One-time items (brief quickadd-one-time-items): a quick-added item leaves Inventory once it is bought, the Edit row's One-time item box does the same for any item,
// and the item stays on Bought for the month it was bought in. Which items count as used, and the later months, are node tests (groceryOneTime.test.ts).
const CATALOGUE = {
  stores: ['Aldi'],
  items: [{ id: 'rice', n: 'Rice', store: 'Aldi', qty: 1, cents: 500, every: true, out: false }],
};
const open = async page => {
  await page.evaluate(CATALOGUE => localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE)), CATALOGUE);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-view-shopping');
};

test('a quick-added item leaves Inventory after it is bought and stays on Bought', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Add one-time item to Aldi' }).click();
  await page.getByLabel('Item name, to add to Aldi').fill('Milk');
  await page.keyboard.press('Enter');
  await page.click('#groc-view-inventory');
  await expect(page.getByText('Milk', { exact: true })).toBeVisible(); // not bought yet: it is on the list
  await page.click('#groc-view-shopping');
  await page.getByLabel('Have Milk').click();
  await page.click('#groc-view-inventory');
  await expect(page.getByText('Milk', { exact: true })).toHaveCount(0);
  await page.click('#groc-view-bought');
  await expect(page.getByText('Milk', { exact: true })).toBeVisible();
});

test('the One-time item box in Edit makes an ordinary item leave Inventory after it is bought', async ({ page }) => {
  await open(page);
  await page.click('#groc-view-inventory');
  await page.click('#groc-edit');
  await page.getByRole('button', { name: 'Expand Rice' }).click();
  const box = page.getByRole('checkbox', { name: /^One-time item/ });
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(box).toBeChecked();
  await page.click('#groc-edit');
  await page.click('#groc-view-shopping');
  await page.getByLabel('Have Rice').click();
  await page.click('#groc-view-inventory');
  await expect(page.getByText('Rice', { exact: true })).toHaveCount(0);
});

test('unticking a used one-time item beside a new one with its name is refused with a reason', async ({ page }) => {
  await open(page);
  const add = async () => { await page.getByRole('button', { name: 'Add one-time item to Aldi' }).click(); await page.getByLabel('Item name, to add to Aldi').fill('Milk'); await page.keyboard.press('Enter'); };
  await add();
  await page.getByLabel('Have Milk').click(); // the first Milk is bought and used
  await add(); // the same name again: a fresh item is allowed
  await page.click('#groc-view-bought');
  await page.getByLabel('Have Milk').click(); // unticking the first one would bring back a second Milk under Aldi
  await expect(page.getByText('There is already a Milk under Aldi. Remove it first, then untick this one.')).toBeVisible();
  await expect(page.getByLabel('Have Milk')).toBeChecked(); // still bought
  await page.click('#groc-next');
  await expect(page.getByText('There is already a Milk under Aldi.')).toHaveCount(0); // the reason does not follow to another month
});
