import { test, expect } from './fixtures.js';
import { openAdd, openNutrition } from './nutritionBoardHelpers.js';

// Saved meals move into Recipes (brief saved-meals-into-recipes, part 2). The move, its once-only record and the plan remap are node tests
// (quickMeals.test.ts, dietSlice.test.ts); this covers what they cannot: a real load with old saved meals, the meals showing in Recipes and Quick add, and no second copy after a reload.
const seedOld = async page => {
  await page.evaluate(() => {
    const cfg = JSON.parse(localStorage.getItem('ironlog:config/main') || '{}');
    cfg.diet = { meals: [{ id: 'm1', n: 'Usual breakfast', items: [{ n: 'Oats', kcal: 350, p: 12 }, { n: 'Banana', kcal: 100, p: 1 }] }, { id: 'm2', n: 'Post-workout', items: [{ n: 'Shake', kcal: 240, p: 40 }] }] };
    localStorage.setItem('ironlog:config/main', JSON.stringify(cfg));
  });
  await page.reload();
};

test('old saved meals appear in Recipes and Quick add once, with their saved numbers, and a reload does not copy them again', async ({ page }) => {
  await seedOld(page);
  await openNutrition(page);
  const list = (await openAdd(page, 'Saved meals')).getByRole('list', { name: 'Saved meals' }); // the add sheet's Saved meals way
  await expect(list.getByRole('button', { name: 'Usual breakfast · 1 food · 450 kcal' })).toBeVisible();
  await expect(list.getByRole('button', { name: 'Post-workout · 1 food · 240 kcal' })).toBeVisible();
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.locator('#recipes-tab-meals').click();
  await expect(page.locator('.rc-row', { hasText: 'Usual breakfast' })).toHaveCount(1);
  await expect(page.locator('.rc-row', { hasText: 'Post-workout' })).toHaveCount(1);
});
