import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, openManage, openNutrition, openTargets } from './nutritionBoardHelpers.js';

// Brief nutrition-items-row-sheet-and-more: three lines of text that pointed at another screen are buttons now: "New recipe", "Edit in Recipes" and "Water reminder". The fixed clock is Thursday 2026-09-24.
const seedRecipes = async (page, list) => { await page.evaluate(l => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })), list); await page.reload(); };

test('no recipes yet: the Recipes way of adding has a New recipe button that opens the blank form', async ({ page }) => {
  await openNutrition(page);
  const sheet = await openAdd(page, 'Recipes');
  await expect(sheet).toContainText('No recipes yet.');
  await expect(sheet).not.toContainText('Add a recipe in Recipes first');
  await sheet.getByRole('button', { name: /New recipe/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => location.hash)).toContain('recipes/form');
});

test('a recipe without calories and protein: its portion sheet has an Edit in Recipes button that opens that recipe\'s form', async ({ page }) => {
  await seedRecipes(page, [{ id: 'plain', n: 'Plain rice', cat: 'carb', ing: [{ n: 'Rice' }], steps: ['Boil.'] }]);
  await openNutrition(page);
  const add = await openAdd(page, 'Recipes');
  await add.getByRole('button', { name: 'Log Plain rice' }).click();
  const portion = page.getByRole('dialog', { name: 'Plain rice' });
  await expect(portion).toContainText('Add calories and protein per serving to log this.');
  await expect(portion).not.toContainText('Open it in Recipes');
  await portion.getByRole('button', { name: 'Edit in Recipes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Plain rice');
});

test('Targets and goal: Water reminder opens Settings at the Alerts panel', async ({ page }) => {
  await openNutrition(page);
  await openTargets(page);
  await page.locator('#nb-manage-water').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('settings');
  await expect(page.locator('#pushalerts, #set-app-h').last()).toBeInViewport(); // the Alerts panel comes after the App heading in the page, so .last() is it; a browser with no push shows the App group's heading instead
});
