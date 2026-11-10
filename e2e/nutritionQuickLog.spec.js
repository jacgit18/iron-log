import { test, expect } from './fixtures.js';
import { startFood } from './recipesNav.js';
import { closeSheet, openAdd, openNutrition } from './nutritionBoardHelpers.js';

// Logging from the Nutrition tab (brief nutrition-quick-log). The rules (the chips, the numbers, the day check) are node tests (dietRecent.test.ts, dietLog.test.ts);
// this covers the wiring: the strip, the portion sheet with its Undo, the Log button in Recipes, and a scanned food created and logged once. The reader, the camera and the route
// are stubbed; the real camera is the owner's check on a phone.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const photo = { name: 'barcode.png', mimeType: 'image/png', buffer: PNG };
const eaten = page => page.locator('.nb-col.today .nb-eat'); // today's Eaten list on the Nutrition board
// The Recent and favorites chips are in the add sheet's Quick add way (brief nutrition-board); the sheet is closed again before the next step.
const chips = async page => (await openAdd(page, 'Quick add'));
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const openDiet = openNutrition;
const make = async (page, name = 'Boiled egg', kcal = '70', protein = '6') => {
  await openRecipes(page);
  await startFood(page);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Calories per serving').fill(kcal);
  await page.getByLabel('Protein per serving (g)').fill(protein);
  await page.getByLabel('Usual amount, optional').fill('3');
  await page.getByLabel('One serving is called, optional').fill('egg');
  await page.getByRole('button', { name: 'Save food' }).click();
};
const sheet = page => page.getByRole('dialog');

test('the strip hides with nothing logged; after logging a food the chip opens the sheet at the usual amount, and Undo removes only that entry', async ({ page }) => {
  await openDiet(page);
  await expect((await chips(page)).getByText('Recent and favorites')).toHaveCount(0);
  await closeSheet(page);
  await make(page);
  await page.getByRole('button', { name: 'Ate this' }).click();
  await expect(page.getByText('Logged 3 eggs of Boiled egg to today.')).toBeVisible();
  await openDiet(page);
  const strip = await chips(page);
  await expect(strip.getByText('Recent and favorites')).toBeVisible();
  await strip.getByRole('list', { name: 'Recent and favorites' }).getByRole('button', { name: 'Boiled egg' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Boiled egg' })).toBeVisible();
  await expect(sheet(page).getByText('3 eggs').first()).toBeVisible(); // the usual amount
  await expect(sheet(page).getByText('210 kcal · 18 g protein for 3 eggs')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Less' }).click();
  await expect(sheet(page).getByText('175 kcal · 15 g protein for 2.5 eggs')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Log it' }).click();
  await expect(sheet(page).getByText('Logged 2.5 eggs to today.')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await expect(eaten(page)).toHaveCount(2);
  await (await chips(page)).getByRole('list', { name: 'Recent and favorites' }).getByRole('button', { name: 'Boiled egg' }).click();
  await sheet(page).getByRole('button', { name: 'Log it' }).click();
  await sheet(page).getByRole('button', { name: 'Undo' }).click(); // only the entry this sheet made
  await sheet(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(eaten(page)).toHaveCount(2);
});

test('the sheet refuses a future day with the usual wording and accepts a past one', async ({ page }) => {
  await make(page);
  await page.getByRole('button', { name: 'Log', exact: true }).first().click();
  const tomorrow = await page.evaluate(() => new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
  const yesterday = await page.evaluate(() => new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
  await sheet(page).getByLabel('Day').fill(tomorrow);
  await sheet(page).getByRole('button', { name: 'Log it' }).click();
  await expect(sheet(page).getByRole('alert')).toHaveText('Pick today or an earlier day.');
  await sheet(page).getByLabel('Day').fill(yesterday);
  await sheet(page).getByRole('button', { name: 'Log it' }).click();
  await expect(sheet(page).getByText(`Logged 3 eggs to ${yesterday}.`)).toBeVisible();
});

test('Recipes rows and the food page have Log, and Ate this still works on the page', async ({ page }) => {
  await make(page);
  await page.getByRole('button', { name: 'Log', exact: true }).first().click(); // the page's own Log
  await expect(sheet(page).getByRole('heading', { name: 'Boiled egg' })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Ate this' }).click();
  await expect(page.getByText('Logged 3 eggs of Boiled egg to today.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to recipes' }).click();
  await expect(page.getByRole('button', { name: 'Log', exact: true })).toBeVisible(); // the row's Log
});

test('a scanned food is created with the chosen type and logged once', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:session/admin', 'true');
    window.BarcodeDetector = class { static async getSupportedFormats() { return ['ean_13', 'upc_a']; } async detect() { return [{ rawValue: '016000275287', format: 'upc_a' }]; } };
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await page.route('**/api/foods/barcode/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, hit: { id: 2, name: 'Almond milk', brand: 'Silk', kcal: 30, p: 1, c: 1, f: 2.5, serving: 240 } }) }));
  await page.reload();
  await openDiet(page);
  await page.getByRole('button', { name: 'Scan barcode', exact: true }).click(); // the toolbar's button; it replaced the Quick add strip's Scan a food
  await page.getByLabel('Barcode photo').setInputFiles(photo);
  const scanned = page.getByRole('group', { name: 'Scanned food' });
  await expect(scanned.getByText('Almond milk (Silk) · 30 kcal per 100 g')).toBeVisible();
  await scanned.getByRole('group', { name: 'Type' }).getByRole('button', { name: 'Drink' }).click();
  await expect(scanned.getByText('72 kcal · 2.4 g protein · 2.4 g carbs · 6 g fat')).toBeVisible();
  const go = scanned.getByRole('button', { name: 'Save and log it' });
  await go.dblclick(); // a double tap still logs once
  await expect(page.getByText('Saved Almond milk (Silk) as drink and logged it.')).toBeVisible();
  await expect(eaten(page)).toHaveCount(1);
  await openRecipes(page);
  await expect(page.locator('.rc-row', { hasText: 'Almond milk (Silk)' })).toHaveCount(1);
  await openDiet(page); // the same product scanned again is logged under the saved food, not saved twice
  await page.getByRole('button', { name: 'Scan barcode', exact: true }).click(); // the toolbar's button; it replaced the Quick add strip's Scan a food
  await page.getByLabel('Barcode photo').setInputFiles(photo);
  await page.getByRole('group', { name: 'Scanned food' }).getByRole('button', { name: 'Save and log it' }).click();
  await expect(page.getByText('Logged Almond milk (Silk), a food you already had.')).toBeVisible();
  await expect(eaten(page)).toHaveCount(2);
  await openRecipes(page);
  await expect(page.locator('.rc-row', { hasText: 'Almond milk (Silk)' })).toHaveCount(1);
});

test('a scanned food is logged to the day the scan began on, even if another day is picked before Save', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:session/admin', 'true');
    window.BarcodeDetector = class { static async getSupportedFormats() { return ['ean_13', 'upc_a']; } async detect() { return [{ rawValue: '016000275287', format: 'upc_a' }]; } };
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await page.route('**/api/foods/barcode/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, hit: { id: 2, name: 'Almond milk', brand: 'Silk', kcal: 30, p: 1, c: 1, f: 2.5, serving: 240 } }) }));
  await page.reload();
  await openDiet(page);
  await page.getByRole('button', { name: 'Scan barcode', exact: true }).click();
  await page.getByLabel('Barcode photo').setInputFiles(photo);
  const scanned = page.getByRole('group', { name: 'Scanned food' });
  await expect(scanned).toBeVisible();
  await page.locator('.nb-col[data-day="2026-09-25"]').getByRole('button', { name: /^Fri 25/ }).click(); // another day, before saving
  await scanned.getByRole('button', { name: 'Save and log it' }).click();
  await expect(page.getByText(/Saved Almond milk \(Silk\) as .* and logged it\./)).toBeVisible();
  await expect(page.locator('.nb-col.today .nb-eat')).toHaveCount(1);
  await expect(page.locator('.nb-col[data-day="2026-09-25"] .nb-eat')).toHaveCount(0);
});
