import { test, expect } from './fixtures.js';

// A non-ready recipe can carry a usual amount (normRecipe keeps it on every category) but the recipe form has no field for it: saving there must pass it through.
const stew = { id: 'stew', n: 'Stew', cat: 'dinner', servings: 2, kcal: 400, p: 30, usual: 1.5, ing: [{ n: 'beans', amt: '1 cup' }], steps: ['Cook it.'] };

test('editing and saving a non-ready recipe in the recipe form keeps its usual amount', async ({ page }) => {
  await page.addInitScript(l => { if (localStorage.getItem('ironlog:recipes/main') === null) localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })); }, [stew]);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.locator('.rc-row', { hasText: 'Stew' }).click();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Bean stew');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.locator('#rc-h')).toHaveText(/Bean stew/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:recipes/main')).items.find(r => r.id === 'stew'));
  expect(saved.n).toBe('Bean stew');
  expect(saved.usual).toBe(1.5);
});
