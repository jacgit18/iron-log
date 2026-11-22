import { expect } from './fixtures.js';

// Starting a recipe or a ready-made food from Recipes + New (brief recipes-find-type-tabs), shared by the recipe specs.
const choose = async (page, name) => {
  await page.locator('#recipes-new').click();
  await page.locator('#recipes-new-list').getByRole('button', { name }).click();
};
export const startRecipe = async page => { await choose(page, 'Recipe or meal'); await unfoldAll(page); };
export const startFood = page => choose(page, 'Add a food');
export const newMenuVisible = page => expect(page.locator('#recipes-new')).toBeVisible();

// The recipe form folds into sections (brief recipe-form-sections): specs that work on fields in several sections unfold them all first.
export const unfoldAll = async page => {
  const folded = page.locator('.rcf-toggle[aria-expanded="false"]');
  while (await folded.count()) await folded.first().click();
};

// Finished ingredient rows fold (brief recipe-safer-editing). `rowAmount` is the row's amount button, or its fold button once it has folded;
// `amountText` matches the amount in either ("2 cups" or "flour · 2 cups"); `reopenRow` opens a folded row so its fields can be edited.
export const rowAmount = (page, i) => page.locator('.rc-ingblock').nth(i).locator('.rc-amt, .rc-fold');
export const amountText = text => new RegExp(`^(.* · )?${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\(or .*\\))?( · skipped)?$`);
export const reopenRow = async (page, i) => { const fold = page.locator('.rc-ingblock').nth(i).locator('.rc-fold'); if (await fold.count()) await fold.click(); };
