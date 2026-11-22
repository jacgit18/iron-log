import { test, expect } from './fixtures.js';

// Groceries make Foods (brief groceries-make-foods). What a node test cannot catch: the Inventory add really making a Food that the "new from groceries" row and the Foods tab
// dot show, a type chip moving the Food to its sub-tab, Looks right clearing both, and the sweep button writing only when tapped. The rules (name, type, link, cap, Undo) are
// node tests (foodFromItem.test.ts, newFromGroceries.test.ts, groceryFoodSlice.test.ts).
const addItem = async (page, name) => {
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-view-inventory');
  await page.click('#groc-tile-add');
  await page.fill('#groc-name', name); await page.click('#groc-add');
  await page.click('#groc-done');
};
const foods = page => page.click('#daily-recipes');

test('an added item makes a Food that waits in the new-from-groceries row until Looks right', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await addItem(page, 'Whole milk');
  await expect(page.locator('#daily-recipes .nfg-dot')).toHaveCount(1);
  await foods(page);
  await page.click('#recipes-group-store');
  const pill = page.locator('#nfg-pill');
  await expect(pill).toContainText('1 new from groceries');
  await expect(pill).toHaveAttribute('aria-expanded', 'false');
  await pill.click();
  await expect(page.getByLabel('Confirm Whole milk')).toBeVisible();
  await expect(page.getByText('No nutrition yet')).toBeVisible();
  await page.click('#recipes-sec-drinks'); // guessed Drink: it is in Drinks at once
  await expect(page.locator('.rc-cards .rc-title b')).toHaveText(['Whole milk']);
  await page.getByLabel('Set Whole milk to Ingredient').click();
  await page.click('#recipes-sec-ingredients');
  await expect(page.locator('.rc-cards .rc-title b')).toHaveText(['Whole milk']);
  await page.getByLabel('Confirm Whole milk').click();
  await expect(page.locator('#nfg-pill')).toHaveCount(0);
  await expect(page.locator('#daily-recipes .nfg-dot')).toHaveCount(0);
});

test('the sweep lists list items with no Food and writes nothing until it is tapped', async ({ page }) => {
  await page.addInitScript(() => { if (localStorage.getItem('ironlog:grocery/main') === null) localStorage.setItem('ironlog:grocery/main', JSON.stringify({ stores: [''], items: [{ id: 'old-1', n: 'Lasagna', store: '', qty: 1, cents: null, every: true, out: false }, { id: 'old-2', n: 'Oat milk', store: '', qty: 1, cents: null, every: true, out: false }] })); });
  await page.reload();
  await page.click('#tab-daily'); await foods(page);
  await page.click('#recipes-group-store');
  await expect(page.locator('#nfg-pill')).toContainText('2 list items have no Food');
  await page.locator('#nfg-pill').click();
  await expect(page.locator('.nfg-preview li')).toHaveCount(2);
  await expect(page.locator('#daily-recipes .nfg-dot')).toHaveCount(0); // nothing is made yet
  await page.click('#nfg-sweep');
  await expect(page.getByText('Made 2 Foods.')).toBeVisible();
  await expect(page.locator('#nfg-pill')).toContainText('2 new from groceries');
});
