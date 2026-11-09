import { test, expect } from './fixtures.js';
import { openAdd, openNutrition } from './nutritionBoardHelpers.js';
import { startFood } from './recipesNav.js';

// Brief recipes-vitamins-minerals: vitamins and minerals on a ready-made food. The rules (scaling, the roll-up of a meal, the calculator's every-food rule, the old-recipe cases) are node tests
// (lib/recipeMicro.test.ts); this covers the wiring a node test cannot: a looked-up food saved on the real Ready-made form, logged again from the board with two servings, and the form dropping
// the amounts when calories are changed. It reads the saved recipes and food log. Admin session (Recipes is admin-only). The fixed clock is Thursday 2026-09-24.
const SPINACH = { ok: true, hits: [{ id: 7, name: 'Spinach', kcal: 100, p: 10, c: 5, f: 1, micro: { calcium: 100, iron: 2 } }] };
const recipes = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:recipes/main') || '{}').items || []);
const eaten = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:diet/main') || '{}').items || []);

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true')); await page.reload(); });

async function lookUpAndFill(page) {
  await page.route('**/api/foods/search*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SPINACH) }));
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await startFood(page);
  await page.getByRole('searchbox').or(page.getByRole('combobox')).first().fill('spinach');
  await page.getByRole('button', { name: /Spinach/ }).first().click();
  await page.getByLabel('Grams').fill('100');
  await page.getByRole('button', { name: 'Use', exact: true }).click();
  await expect(page.getByLabel('Calories per serving')).toHaveValue('100');
}

test('a looked-up food saved on the Ready-made form keeps its amounts, and logging it twice from the board puts twice the amounts on the entry', async ({ page }) => {
  await lookUpAndFill(page);
  await expect(page.getByText(/Vitamins and minerals from the lookup or photo/)).toContainText('Calcium 100 mg, Iron 2 mg'); // each amount named, to check against the label
  await page.getByRole('button', { name: 'Save food' }).click();
  await expect.poll(async () => (await recipes(page)).length).toBe(1);
  expect((await recipes(page))[0].micro).toEqual({ calcium: 100, iron: 2 });
  await openNutrition(page);
  const sheet = await openAdd(page, 'Recipes');
  await sheet.getByRole('button', { name: 'Log Spinach' }).click();
  const portion = page.getByRole('dialog').last();
  await portion.getByRole('button', { name: 'More' }).click(); // 1 serving, then 1.5
  await portion.getByRole('button', { name: 'More' }).click(); // 2
  await portion.getByRole('button', { name: 'Ate this' }).or(portion.getByRole('button', { name: /^Log it/ })).first().click();
  await expect.poll(async () => (await eaten(page)).length).toBe(1);
  const [e] = await eaten(page);
  expect(e.kcal).toBe(200);
  expect(e.micro).toEqual({ calcium: 200, iron: 4 });
});

test('changing the calories on the form before saving drops the amounts, so a food never carries amounts that disagree with its calories', async ({ page }) => {
  await lookUpAndFill(page);
  await page.getByLabel('Calories per serving').fill('150');
  await expect(page.getByText(/Vitamins and minerals from the lookup or photo/)).toHaveCount(0); // the line follows the calories
  await page.getByRole('button', { name: 'Save food' }).click();
  await expect.poll(async () => (await recipes(page)).length).toBe(1);
  const [r] = await recipes(page);
  expect(r.kcal).toBe(150);
  expect('micro' in r).toBe(false);
});
