import { expect } from './fixtures.js';

// Starting a recipe or a ready-made food from Recipes + New (brief recipes-find-type-tabs), shared by the recipe specs.
const choose = async (page, name) => {
  await page.locator('#recipes-new').click();
  await page.locator('#recipes-new-list').getByRole('button', { name }).click();
};
export const startRecipe = async page => { await choose(page, 'Recipe or meal'); await unfoldAll(page); };
export const startFood = page => choose(page, 'Add a food by hand');
export const newMenuVisible = page => expect(page.locator('#recipes-new')).toBeVisible();

// The recipe form folds into sections (brief recipe-form-sections): specs that work on fields in several sections unfold them all first.
export const unfoldAll = async page => {
  const folded = page.locator('.rcf-toggle[aria-expanded="false"]');
  while (await folded.count()) await folded.first().click();
};
