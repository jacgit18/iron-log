import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, openNutrition } from './nutritionBoardHelpers.js';

// Brief week-shopping: Add missing to Shopping in the Nutrition board's toolbar. Which recipes count, what counts as missing and the Undo that removes only what a tap added are node tests
// (weekShopping.test.ts, dietSlice.test.ts); this covers the wiring: the button, the notice, Undo, last week, and the phone toolbar. The fixed clock is Thursday 2026-09-24.
const TOMORROW = '2026-09-25';
const recipes = [
  { id: 'pasta', n: 'Pasta bake', cat: 'protein', ing: [{ n: 'garlic' }, { n: 'pasta' }], steps: ['Bake.'] },
  { id: 'bread', n: 'Garlic bread', cat: 'carbs', ing: [{ n: 'garlic' }, { n: 'flour' }], steps: ['Bake.'] },
];
const seedRecipes = async page => { await page.evaluate(l => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })), recipes); await page.reload(); };
const shopping = page => page.locator('#nb-shopping');
// What is on Shopping, read from the stored list (the store writes it as items are added or removed).
const listed = page => page.evaluate(() => { const d = JSON.parse(localStorage.getItem('ironlog:grocery/main') || 'null'); return ((d && (d.items || (d.data && d.data.items))) || []).map(i => i.n).sort(); });
const planTomorrow = async (page, name, phone = false) => {
  if (phone) await page.getByRole('group', { name: 'Day stepper' }).getByRole('button', { name: 'Next day' }).click(); // one day at a time on a phone
  else await page.locator(`.nb-col[data-day="${TOMORROW}"] .nb-dayname`).click();
  const sheet = await openAdd(page, 'Recipes');
  await sheet.getByRole('group', { name: 'Which meal' }).getByRole('button', { name: 'Dinner', exact: true }).click();
  await sheet.getByLabel('Find a recipe').fill(name);
  await sheet.getByRole('button', { name: `Plan ${name} for Dinner` }).click();
  await closeSheet(page);
};

test('on a wide board the toolbar button is off with nothing planned; two planned recipes add each missing ingredient once, and Undo takes back only those', async ({ page }) => {
  await seedRecipes(page);
  await openNutrition(page);
  await expect(shopping(page)).toBeDisabled();
  await planTomorrow(page, 'Pasta bake');
  await planTomorrow(page, 'Garlic bread');
  await expect(shopping(page)).toBeEnabled();
  await shopping(page).click();
  const note = page.locator('.removednote');
  await expect(note).toContainText('Added 3 to Shopping; 1 already there.') // the second recipe finds garlic already added by the first;
  await expect.poll(() => listed(page)).toEqual(['flour', 'garlic', 'pasta']);
  await expect(shopping(page)).toBeDisabled(); // everything is on the list now, so there is nothing new to add
  await note.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => listed(page)).toEqual([]);
  await expect(shopping(page)).toBeEnabled();
  await shopping(page).click();
  await expect.poll(() => listed(page)).toEqual(['flour', 'garlic', 'pasta']);
});

test('on a phone the button is in the Manage sheet, not the toolbar; a tap closes the sheet and the board shows the Undo notice; last week dims it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await seedRecipes(page);
  await openNutrition(page);
  await expect(shopping(page)).toHaveCount(0); // the phone toolbar is unchanged (the day card stays under 400 px, nutritionLayout.spec.js)
  await page.locator('#nb-manage').click();
  await expect(page.getByRole('dialog').locator('#nb-shopping')).toBeDisabled(); // nothing planned yet
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await planTomorrow(page, 'Pasta bake', true);
  await page.locator('#nb-manage').click();
  const manage = page.getByRole('dialog');
  expect(await manage.locator('#nb-shopping').evaluate(e => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(43.5);
  await manage.locator('#nb-shopping').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.removednote')).toContainText('Added 2 to Shopping.');
  await expect.poll(() => listed(page)).toEqual(['garlic', 'pasta']);
  await page.locator('.removednote').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => listed(page)).toEqual([]);
  await page.getByRole('group', { name: 'Day stepper' }).getByRole('combobox', { name: 'Day to show' }).selectOption('2026-09-19');
  await page.locator('#nb-manage').click();
  await expect(page.getByRole('dialog').locator('#nb-shopping')).toBeDisabled(); // last week adds nothing
});
