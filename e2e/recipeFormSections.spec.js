import { test, expect } from './fixtures.js';
import { startRecipe } from './recipesNav.js';

// The recipe form's folding sections (brief recipe-form-sections). The rules (summaries, which section owns a field) are node tests
// (recipeFormSections.test.ts); this covers the wiring, the position of Save, and focus after a problem.
const FIVE = { id: 'chili-1', n: 'Chili', cat: 'other', servings: 4, ing: ['beans', 'rice', 'onion', 'corn', 'pepper'].map(n => ({ n, amt: '1 cup' })), steps: ['Cook.'] };
const toggle = (page, title) => page.locator('.rcf-toggle', { hasText: title });
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const seed = (page, items) => page.addInitScript(items => { if (!localStorage.getItem('ironlog:recipes/main')) localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items })); }, items);
const saveVisible = async page => {
  const box = await page.getByRole('button', { name: 'Save recipe' }).boundingBox();
  const vp = page.viewportSize();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
};

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('a new recipe opens with Basics unfolded and the other four folded with summaries', async ({ page }) => {
    await openRecipes(page);
    await page.locator('#recipes-new').click();
    await page.locator('#recipes-new-list').getByRole('button', { name: 'Recipe or meal' }).click();
    await expect(toggle(page, 'Basics')).toHaveAttribute('aria-expanded', 'true');
    for (const t of ['Ingredients', 'Steps', 'Nutrition per serving', 'Tags, note and video']) await expect(toggle(page, t)).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle(page, 'Ingredients')).toContainText('· None yet');
    await expect(toggle(page, 'Nutrition per serving')).toContainText('· Not set');
    await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Ingredient 1', { exact: true })).toBeHidden();
  });

  test('editing a recipe with five ingredients shows "Ingredients · 5" and unfolding shows the rows', async ({ page }) => {
    await seed(page, [FIVE]);
    await page.reload();
    await openRecipes(page);
    await page.locator('.rc-row', { hasText: /Chili/ }).click();
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(toggle(page, 'Ingredients')).toContainText('Ingredients · 5');
    await toggle(page, 'Ingredients').click();
    await expect(page.getByLabel('Ingredient 5', { exact: true })).toHaveValue('pepper');
  });

  test('Save is on screen in every section state', async ({ page }) => {
    await openRecipes(page);
    await startRecipe(page); // every section unfolded
    await saveVisible(page);
    await page.mouse.wheel(0, 3000);
    await saveVisible(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const unfolded = page.locator('.rcf-toggle[aria-expanded="true"]');
    while (await unfolded.count()) await unfolded.first().click(); // every section folded
    await saveVisible(page);
  });

  test('a problem unfolds the section that holds the field and focuses it', async ({ page }) => {
    await openRecipes(page);
    await page.locator('#recipes-new').click();
    await page.locator('#recipes-new-list').getByRole('button', { name: 'Recipe or meal' }).click();
    await toggle(page, 'Tags, note and video').click();
    await page.getByLabel('Video link (optional)').fill('mailto:a@b.co');
    await toggle(page, 'Tags, note and video').click(); // folded again with the problem inside
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(toggle(page, 'Tags, note and video')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByLabel('Video link (optional)')).toBeFocused();
  });

  test('a bad Servings number unfolds Basics even after it was folded', async ({ page }) => {
    await openRecipes(page);
    await page.locator('#recipes-new').click();
    await page.locator('#recipes-new-list').getByRole('button', { name: 'Recipe or meal' }).click();
    await page.getByLabel('Servings', { exact: true }).fill('abc');
    await toggle(page, 'Basics').click();
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(toggle(page, 'Basics')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByLabel('Servings', { exact: true })).toBeFocused();
  });
});

// Done when 5: Cancel from Edit returns to the recipe, not the list (the line is in Recipes.tsx, brief recipes-list-compact).
test('Cancel from Edit lands on the recipe page', async ({ page }) => {
  await seed(page, [FIVE]);
  await page.reload();
  await openRecipes(page);
  await page.locator('.rc-row', { hasText: /Chili/ }).click();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: /Chili/ })).toBeVisible();
});
