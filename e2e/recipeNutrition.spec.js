import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Recipe nutrition badges and filters (brief recipe-nutrition-badges). The rules (badge text, the 30 g and 500 kcal thresholds, the AND filter, which
// starter tags are offered) are node tests (recipeNutrition.test.ts, recipeTags.test.ts); this covers what they cannot see: the badge on a Mine row, the
// two chips narrowing the list beside a category and a tag chip, and a starter tag picked in the real form being saved and then listed as a tag chip.
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const make = async (page, name, cat, { kcal, p, tags = [] } = {}) => {
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Category').selectOption({ label: cat });
  await page.getByLabel('Ingredient 1', { exact: true }).fill('salt');
  for (const t of tags) await page.getByRole('button', { name: `Use ${t}` }).click();
  if (kcal !== undefined || p !== undefined) {
    await page.getByRole('button', { name: 'Edit nutrition per serving' }).click();
    if (kcal !== undefined) await page.getByLabel('Calories per serving').fill(String(kcal));
    if (p !== undefined) await page.getByLabel('Protein per serving (g)').fill(String(p));
  }
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'Back to recipes' }).click();
};
const rows = page => page.locator('.rc-list .rc-row b');
const nutrition = page => page.getByRole('group', { name: 'Nutrition', exact: true });

test('a badge shows on rows with numbers, and the two chips narrow the list beside a category and a tag chip', async ({ page }) => {
  await openRecipes(page);
  await make(page, 'Chili', 'Protein', { kcal: 450, p: 35, tags: ['Dinner'] });
  await make(page, 'Steak', 'Protein', { kcal: 700, p: 50, tags: ['Dinner'] });
  await make(page, 'Rice', 'Carbs', { kcal: 300, p: 5 });
  await make(page, 'Mystery', 'Protein', { tags: ['Dinner'] });
  const row = name => page.locator('.rc-row', { hasText: name });
  await expect(row('Chili').locator('.rc-badge')).toHaveText('450 kcal · 35 g protein');
  await expect(row('Mystery').locator('.rc-badge')).toHaveCount(0);

  await nutrition(page).getByRole('button', { name: 'High protein' }).click();
  await expect(rows(page)).toHaveText(['Chili', 'Steak']);
  await nutrition(page).getByRole('button', { name: 'Under 500 kcal' }).click(); // both: AND
  await expect(rows(page)).toHaveText(['Chili']);
  await nutrition(page).getByRole('button', { name: 'High protein' }).click();
  await expect(rows(page)).toHaveText(['Chili', 'Rice']);
  await page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Carbs' }).click(); // with a category
  await expect(rows(page)).toHaveText(['Rice']);
  await page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('group', { name: 'Tags', exact: true }).getByRole('button', { name: 'Dinner' }).click(); // with a tag
  await expect(rows(page)).toHaveText(['Chili']); // Mystery has the tag but no calories: not matched, no error
  await nutrition(page).getByRole('button', { name: 'Under 500 kcal' }).click();
  await expect(rows(page)).toHaveText(['Chili', 'Mystery', 'Steak']);
});

test('starter tags are offered in the form, saved like any tag, and then listed with the tags in use', async ({ page }) => {
  await openRecipes(page);
  await page.getByRole('button', { name: 'New recipe' }).click();
  const starters = page.getByRole('group', { name: 'Suggested tags' });
  await expect(starters.getByRole('button')).toHaveText(['Use Breakfast', 'Use Lunch', 'Use Dinner', 'Use Snack']);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await make(page, 'Oats', 'Other', { tags: ['Breakfast'] });
  await expect(page.getByRole('group', { name: 'Tags', exact: true }).getByRole('button')).toHaveText(['Breakfast']);
  await page.getByRole('button', { name: 'New recipe' }).click();
  await expect(page.getByRole('group', { name: 'Suggested tags' }).getByRole('button')).toHaveText(['Use Lunch', 'Use Dinner', 'Use Snack']); // Breakfast now shows under tags in use
  await expect(page.getByRole('group', { name: 'Tags you use' }).getByRole('button')).toHaveText(['Use Breakfast']);
});

test('the Nutrition chips have no accessibility violations', async ({ page }) => {
  await openRecipes(page);
  await make(page, 'Chili', 'Protein', { kcal: 450, p: 35 });
  const r = await new AxeBuilder({ page }).include('.panel').analyze();
  expect(r.violations).toEqual([]);
});
