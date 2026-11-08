import { expect } from './fixtures.js';

// Starting a recipe or a ready-made food from Recipes + New (brief recipes-find-type-tabs), shared by the recipe specs.
const choose = async (page, name) => {
  await page.locator('#recipes-new').click();
  await page.locator('#recipes-new-list').getByRole('button', { name }).click();
};
export const newRecipe = page => choose(page, 'Write a recipe');
export const newFood = page => choose(page, 'Add a food by hand');
export const newMenuVisible = page => expect(page.locator('#recipes-new')).toBeVisible();
