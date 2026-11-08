import { test, expect } from './fixtures.js';
import { startFood } from './recipesNav.js';

// Food type and the Review types screen (brief food-type-and-migration). The name rules, the cleaner and the store action are node tests
// (foodType.test.ts, recipes.test.ts, recipesSlice.test.ts); this covers what they cannot: the Type buttons on the real form, the banner, the
// review page's address, Back and reload, and Undo on the list.
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
// Foods saved before types existed, in place after a reload (the same way recipeCustomise.spec.js seeds recipes).
const seed = async (page, names) => {
  await page.evaluate(list => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: list.map((n, i) => ({ id: `f${i}`, n, cat: 'ready', ing: [], steps: [], kcal: 100, p: 5 })) })), names);
  await page.reload();
  await openRecipes(page);
};

test('the ready-made form needs a Used as, starting on Ready to eat, and saves the one picked', async ({ page }) => {
  await openRecipes(page);
  await startFood(page);
  const type = page.getByRole('group', { name: 'Used as' });
  await expect(type.getByRole('button', { name: 'Ready to eat' })).toHaveAttribute('aria-pressed', 'true');
  await type.getByRole('button', { name: 'Drink' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Goat kefir');
  await page.getByLabel('Calories per serving').fill('150');
  await page.getByLabel('Protein per serving (g)').fill('8');
  await page.getByRole('button', { name: 'Save food' }).click();
  await page.getByRole('button', { name: 'Back to recipes' }).click();
  await expect(page.getByText(/needs? a type/)).toHaveCount(0); // it is typed, so no banner
  await page.locator('.rc-row', { hasText: /Goat kefir/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('group', { name: 'Used as' }).getByRole('button', { name: 'Drink' })).toHaveAttribute('aria-pressed', 'true');
});

test('untyped foods show a banner; Review types suggests from the name, a changed row wins, Looks right saves, Undo restores', async ({ page }) => {
  await seed(page, ['Whole milk', 'Eggs, large', 'Frozen lasagna']);
  await expect(page.getByText('3 foods need a type.')).toBeVisible();
  await page.getByRole('button', { name: 'Review types' }).click();
  await expect(page).toHaveURL(/#\/daily\/recipes\/types$/);
  const pressed = async (food, label) => expect(page.getByRole('group', { name: `Used as for ${food}` }).getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
  await pressed('Whole milk', 'Drink');
  await pressed('Eggs, large', 'Ingredient');
  await pressed('Eggs, large', 'Ready to eat'); // eggs are both: one food, two labels
  await pressed('Frozen lasagna', 'Ready to eat');
  await page.reload(); // the page is not kept in the address: a reload shows the list
  await expect(page).toHaveURL(/#\/daily\/recipes$/);
  await page.getByRole('button', { name: 'Review types' }).click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible();
  await page.getByRole('button', { name: 'Review types' }).click();
  await page.getByRole('group', { name: 'Used as for Frozen lasagna' }).getByRole('button', { name: 'Drink' }).click();
  await page.getByRole('button', { name: 'Looks right' }).click();
  await expect(page.getByText('Food types saved.')).toBeVisible();
  await expect(page.getByText(/needs? a type/)).toHaveCount(0);
  for (const tab of ['ingredients', 'foods']) { // the two-label food is in both tabs
    await page.locator(`#recipes-tab-${tab}`).click();
    await expect(page.locator('.rc-row', { hasText: /Eggs, large/ })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('3 foods need a type.')).toBeVisible();
});

test('with no ready-made foods there is no banner', async ({ page }) => {
  await openRecipes(page);
  await expect(page.getByRole('button', { name: 'Review types' })).toHaveCount(0);
});
