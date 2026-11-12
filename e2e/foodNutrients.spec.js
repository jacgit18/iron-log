import { test, expect } from './fixtures.js';
import { closeSheet, editEaten, openAdd, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Brief food-vitamins-minerals, PR A: vitamins and minerals from a lookup ride along to the logged food. Nothing shows them yet (the Totals sheet follows in PR B), so this reads the saved
// food log. The vendor maps, scaling, caps and the copy and re-log paths are node tests (shared/foodMicro.test.ts, lib/foodMicroFlow.test.ts); this covers the wiring a node test cannot:
// Find food through the real sheets into the saved entry, the One-off form dropping them when calories are changed, and an edit of an eaten food keeping them.
const SPINACH = { ok: true, hits: [{ id: 7, name: 'Spinach', kcal: 100, p: 10, c: 5, f: 1, micro: { calcium: 100, iron: 2 } }] };
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:diet/main') || '{}').items || []);
const find = async (page, grams) => {
  await page.route('**/api/foods/search*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SPINACH) }));
  const sheet = await openAdd(page, 'Find food');
  await sheet.getByRole('searchbox').or(sheet.getByRole('combobox')).first().fill('spinach');
  await sheet.getByRole('button', { name: /Spinach/ }).first().click();
  await sheet.getByLabel('Grams').fill(String(grams));
  await sheet.getByRole('button', { name: 'Use', exact: true }).click();
  return sheet;
};

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true')); await page.reload(); });

test('a food found by name is logged with its vitamins and minerals for the grams eaten', async ({ page }) => {
  await openNutrition(page);
  const sheet = await find(page, 150);
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  await expect(todayCol(page).locator('.nb-eat')).toContainText(['Spinach']);
  const [e] = await stored(page);
  expect(e.kcal).toBe(150);
  expect(e.micro).toEqual({ calcium: 150, iron: 3 });
});

test('changing the calories on the One-off form drops the amounts, so they never disagree with the portion', async ({ page }) => {
  await openNutrition(page);
  const sheet = await find(page, 100);
  await sheet.locator('#dt-add-k').fill('120');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  const [e] = await stored(page);
  expect(e.kcal).toBe(120);
  expect('micro' in e).toBe(false);
});

test('editing an eaten food keeps its vitamins and minerals, and changing its calories drops them', async ({ page }) => {
  await openNutrition(page);
  const sheet = await find(page, 100);
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  const [e] = await stored(page);
  await editEaten(page);
  await page.locator(`#nb-e-${e.id}-n`).fill('Spinach, fresh');
  await page.getByRole('button', { name: 'Save' }).click();
  const [renamed] = await stored(page);
  expect(renamed.n).toBe('Spinach, fresh');
  expect(renamed.micro).toEqual({ calcium: 100, iron: 2 }); // a rename keeps them
  await editEaten(page);
  await page.locator(`#nb-e-${e.id}-k`).fill('110');
  await page.getByRole('button', { name: 'Save' }).click();
  const [after] = await stored(page);
  expect(after.kcal).toBe(110);
  expect('micro' in after).toBe(false); // a changed portion: the amounts would no longer match
});
