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
const planTomorrow = async (page, name) => {
  await page.locator(`.nb-col[data-day="${TOMORROW}"] .nb-dayname`).click();
  const sheet = await openAdd(page, 'Recipes');
  await sheet.getByRole('group', { name: 'Which meal' }).getByRole('button', { name: 'Dinner', exact: true }).click();
  await sheet.getByLabel('Find a recipe').fill(name);
  await sheet.getByRole('button', { name: `Plan ${name} for Dinner` }).click();
  await closeSheet(page);
};

test('the button is off with nothing planned; two planned recipes add each missing ingredient once, and Undo takes back only those', async ({ page }) => {
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

test('on a phone the button has its own full row under Add food and the three ways of adding, and last week has no button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await seedRecipes(page);
  await openNutrition(page);
  const box = sel => page.locator(sel).first().evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom }; });
  const add = await box('#nb-add'), shop = await box('#nb-shopping');
  const others = await page.locator('.nb-tbtns .btn:not(#nb-add):not(#nb-shopping)').evaluateAll(els => els.map(e => e.getBoundingClientRect().bottom));
  expect(shop.y).toBeGreaterThan(Math.max(...others) - 1);
  expect(shop.y).toBeGreaterThan(add.b - 1);
  expect(shop.h).toBeGreaterThanOrEqual(43.5);
  expect(shop.w).toBeGreaterThan(390 - 40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await page.getByRole('group', { name: 'Day stepper' }).getByRole('combobox', { name: 'Day to show' }).selectOption('2026-09-19');
  await expect(shopping(page)).toHaveCount(0);
});
