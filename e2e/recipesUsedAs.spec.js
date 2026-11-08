import { startFood, startRecipe } from './recipesNav.js';
import { test, expect } from './fixtures.js';

// Used as labels and the Ingredients tab (brief recipes-used-as-ingredients-tab). The label rules are node tests (recipeUses.test.ts); this covers what they cannot:
// the real tabs, the chips on the two forms, and Log showing only where something can be eaten.
const rc = (id, n, cat, extra = {}) => ({ id, n, cat, ing: [{ n: 'Rice' }], steps: ['Cook.'], servings: 2, kcal: 300, p: 20, ...extra });
const items = [
  rc('chili', 'Beef chili', 'other'), rc('aioli', 'Garlic aioli', 'sauces'), rc('taco', 'Taco seasoning', 'seasonings'),
  rc('rice', 'Brown rice', 'carbs'), rc('egg', 'Egg', 'ready', { type: 'ready', uses: ['ingredient', 'ready'], ing: [], steps: [] }),
];
const open = async page => {
  await page.addInitScript(l => { if (localStorage.getItem('ironlog:recipes/main') === null) localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })); }, items);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-recipes');
};
const titles = page => page.locator('.rc-cards .rc-title b').allTextContents();

test('sauces and seasonings are in Ingredients and not in Meals; rice and a two-label egg are in both places they belong', async ({ page }) => {
  await open(page);
  await expect(page.locator('#recipes-tab-meals')).toHaveText('Meals2');
  await expect(page.locator('#recipes-tab-ingredients')).toHaveText('Ingredients4');
  await expect(page.locator('#recipes-tab-foods')).toHaveText('Foods1');
  await page.click('#recipes-tab-meals');
  expect((await titles(page)).sort()).toEqual(['Beef chili', 'Brown rice']);
  await page.click('#recipes-tab-ingredients');
  expect((await titles(page)).sort()).toEqual(['Brown rice', 'Egg', 'Garlic aioli', 'Taco seasoning']);
  await expect(page.locator('.rc-cards li', { hasText: 'Egg' }).locator('.rc-typetag')).toHaveText('Ingredient + Ready to eat');
  await page.click('#recipes-tab-foods');
  expect(await titles(page)).toEqual(['Egg']);
});

test('Log shows on a meal, rice and the egg, and not on an Ingredient-only sauce', async ({ page }) => {
  await open(page);
  await page.click('#recipes-tab-ingredients');
  await expect(page.locator('.rc-cards li', { hasText: 'Garlic aioli' }).getByRole('button', { name: 'Log' })).toHaveCount(0);
  await expect(page.locator('.rc-cards li', { hasText: 'Egg' }).getByRole('button', { name: 'Log' })).toHaveCount(1);
  await expect(page.locator('.rc-cards li', { hasText: 'Brown rice' }).getByRole('button', { name: 'Log' })).toHaveCount(1);
});

test('the recipe form starts the chips from the category, keeps a pressed choice, and a saved label shows in the tab', async ({ page }) => {
  await open(page);
  await startRecipe(page);
  const used = page.getByRole('group', { name: 'Used as' });
  await expect(used.getByRole('button', { name: 'Meal' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Category').selectOption('Sauces');
  await expect(used.getByRole('button', { name: 'Ingredient' })).toHaveAttribute('aria-pressed', 'true');
  await expect(used.getByRole('button', { name: 'Meal' })).toHaveAttribute('aria-pressed', 'false');
  await used.getByRole('button', { name: 'Meal' }).click(); // pressed: the category no longer decides
  await page.getByLabel('Category').selectOption('Carbs');
  await expect(used.getByRole('button', { name: 'Meal' })).toHaveAttribute('aria-pressed', 'true');
  await expect(used.getByRole('button', { name: 'Ingredient' })).toHaveAttribute('aria-pressed', 'true');
  await used.getByRole('button', { name: 'Ingredient' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Plain pasta');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('pasta');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  const back = page.getByRole('button', { name: 'Back to recipes' });
  if (await back.isVisible()) await back.click();
  await page.click('#recipes-tab-ingredients');
  expect(await titles(page)).not.toContain('Plain pasta');
  await page.click('#recipes-tab-meals');
  expect(await titles(page)).toContain('Plain pasta');
});

test('the ready-made form takes more than one label and never fewer than one', async ({ page }) => {
  await open(page);
  await startFood(page);
  const used = page.getByRole('group', { name: 'Used as' });
  await expect(used.getByRole('button', { name: 'Ready to eat' })).toHaveAttribute('aria-pressed', 'true');
  await used.getByRole('button', { name: 'Ingredient' }).click();
  await expect(used.getByRole('button', { name: 'Ingredient' })).toHaveAttribute('aria-pressed', 'true');
  await used.getByRole('button', { name: 'Ready to eat' }).click();
  await used.getByRole('button', { name: 'Ingredient' }).click(); // the last label stays on
  await expect(used.getByRole('button', { name: 'Ingredient' })).toHaveAttribute('aria-pressed', 'true');
  await used.getByRole('button', { name: 'Drink' }).click(); // Drink stands alone
  await expect(used.getByRole('button', { name: 'Ingredient' })).toHaveAttribute('aria-pressed', 'false');
});
