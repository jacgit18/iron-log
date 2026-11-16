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

test('the strip hides with nothing logged; after logging a food the chip logs it at the usual amount at once, and Undo removes only that entry', async ({ page }) => {
  await openDiet(page);
  await expect((await chips(page)).getByText('Recent and favorites')).toHaveCount(0);
  await closeSheet(page);
  await make(page);
  await page.getByRole('button', { name: 'Add to today' }).click();
  await expect(page.getByText('Logged Boiled egg, 3 eggs, for today.')).toBeVisible();
  await openDiet(page);
  const strip = await chips(page);
  await expect(strip.getByText('Recent and favorites')).toBeVisible();
  await strip.getByRole('list', { name: 'Recent and favorites' }).getByRole('button', { name: 'Boiled egg' }).click(); // one tap logs at the usual amount and the sheet stays open (brief nutrition-log-first-portion-row)
  await expect(sheet(page).getByText('Logged Boiled egg, 3 eggs.')).toBeVisible();
  await strip.getByRole('list', { name: 'Recent and favorites' }).getByRole('button', { name: 'Boiled egg' }).click();
  await sheet(page).getByRole('button', { name: 'Undo' }).click(); // only the entry the last tap made
  await closeSheet(page);
  await expect(eaten(page)).toHaveCount(2);
});

test('the sheet logs a past day and offers a future day as a plan (the plan itself is in logOrPlan.spec.js)', async ({ page }) => {
  await make(page);
  await page.getByRole('button', { name: 'Back to recipes' }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click(); // the row's Log opens the portion sheet
  const tomorrow = await page.evaluate(() => new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
  const yesterday = await page.evaluate(() => new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
  await sheet(page).getByLabel('Day').fill(tomorrow);
  await expect(sheet(page).getByText('Which meal?')).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Plan', exact: true })).toBeVisible();
  await sheet(page).getByLabel('Day').fill(yesterday);
  await sheet(page).getByRole('button', { name: 'Log', exact: true }).click();
  await expect(sheet(page).getByText(new RegExp(`Logged .+: 3 eggs to ${yesterday}\\.`))).toBeVisible();
});

test('Recipes rows have Log, and the food page has Add to today and no Ate this', async ({ page }) => {
  await make(page);
  await expect(page.getByRole('button', { name: 'Ate this' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Log', exact: true })).toHaveCount(0); // the page has no Log form
  await page.getByRole('button', { name: 'Add to today' }).click();
  await expect(page.getByText('Logged Boiled egg, 3 eggs, for today.')).toBeVisible();
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
  await page.getByRole('button', { name: 'Scan and log', exact: true }).click(); // the toolbar's button; it replaced the Quick add strip's Scan a food
  await page.getByLabel('Barcode photo').setInputFiles(photo);
  const scanned = page.getByRole('group', { name: 'Scanned food' });
  await expect(scanned.locator('.fnc-name')).toHaveText('Almond milk'); // the name is its own line, with the brand and kcal under it
  expect(await scanned.locator('.fnc-name').evaluate(e => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(22); // the name is the largest text of the card
  await expect(scanned.getByText('Silk', { exact: true })).toBeVisible();
  await expect(scanned.getByText('30 kcal per 100 g')).toBeVisible();
  await scanned.getByRole('group', { name: 'Type' }).getByRole('button', { name: 'Drink' }).click();
  await expect(scanned.getByText('72 kcal · P 2.4 · C 2.4 · F 6 g')).toBeVisible();
  const go = scanned.getByRole('button', { name: 'Save and log it' });
  await go.dblclick(); // a double tap still logs once
  await expect(page.getByText('Saved Almond milk (Silk) to Recipes as drink and logged it.')).toBeVisible();
  await expect(eaten(page)).toHaveCount(1);
  await openRecipes(page);
  await expect(page.locator('.rc-row', { hasText: 'Almond milk (Silk)' })).toHaveCount(1);
  await openDiet(page); // the same product scanned again is logged under the saved food, not saved twice
  await page.getByRole('button', { name: 'Scan and log', exact: true }).click(); // the toolbar's button; it replaced the Quick add strip's Scan a food
  await page.getByLabel('Barcode photo').setInputFiles(photo);
  await page.getByRole('group', { name: 'Scanned food' }).getByRole('button', { name: 'Save and log it' }).click();
  await expect(page.getByText('Logged Almond milk (Silk), a food you already had in Recipes.')).toBeVisible();
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
  await page.getByRole('button', { name: 'Scan and log', exact: true }).click();
  await page.getByLabel('Barcode photo').setInputFiles(photo);
  const scanned = page.getByRole('group', { name: 'Scanned food' });
  await expect(scanned).toBeVisible();
  await page.locator('.nb-col[data-day="2026-09-25"]').getByRole('button', { name: /^Fri 25/ }).click(); // another day, before saving
  await expect(scanned.getByText('Logs to today, the day you scanned on.')).toBeVisible(); // the panel says where it will log
  await scanned.getByRole('button', { name: 'Save and log it' }).click();
  await expect(page.getByText(/Saved Almond milk \(Silk\) to Recipes as .* and logged it\./)).toBeVisible();
  await expect(page.locator('.nb-col.today .nb-eat')).toHaveCount(1);
  await expect(page.locator('.nb-col[data-day="2026-09-25"] .nb-eat')).toHaveCount(0);
});
