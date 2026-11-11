import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { startFood, startRecipe, unfoldAll } from './recipesNav.js';

// Counts as on a plate (brief week-board, part 2). The derived marks and what is saved are node tests (plate.test.ts); this covers the real forms: the chips start on the
// category, pressing one is kept and saved, Back to automatic returns to the derived marks, and the ready-made form shows them too.
const open = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const counts = page => page.getByRole('group', { name: 'Counts as' });
const on = async (page, name, state = 'true') => expect(counts(page).getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', state);
const back = async page => { const b = page.getByRole('button', { name: 'Back to recipes' }); if (await b.isVisible()) await b.click(); };

test('the chips start on the category, a pressed choice is saved, and Back to automatic returns', async ({ page }) => {
  await open(page);
  await startRecipe(page);
  await page.getByLabel('Category').selectOption('Protein');
  await on(page, 'Protein'); await on(page, 'Carb', 'false'); await on(page, 'Veg', 'false');
  await expect(counts(page).getByRole('button', { name: 'Back to automatic' })).toHaveCount(0);
  await counts(page).getByRole('button', { name: 'Veg' }).click();
  await on(page, 'Veg');
  await expect(counts(page).getByRole('button', { name: 'Back to automatic' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Chili with beans');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('beans');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await back(page);
  await page.locator('.rc-row', { hasText: 'Chili with beans' }).first().click();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await unfoldAll(page);
  await on(page, 'Protein'); await on(page, 'Veg'); // the choice was kept
  await counts(page).getByRole('button', { name: 'Back to automatic' }).click();
  await on(page, 'Veg', 'false');
  await expect(counts(page).getByRole('button', { name: 'Back to automatic' })).toHaveCount(0);
});

test('the last mark stays on, and the ready-made form shows the chips with no violations', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page);
  await startFood(page);
  await page.getByLabel('Protein per serving (g)').fill('30');
  await on(page, 'Protein'); // 25 g or more counts as a protein
  await counts(page).getByRole('button', { name: 'Protein' }).click(); // the only one: it stays
  await on(page, 'Protein');
  const axe = await new AxeBuilder({ page }).include('[aria-label="Counts as"]').analyze();
  expect(axe.violations).toEqual([]);
  for (const b of await counts(page).getByRole('button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(43.5);
});
