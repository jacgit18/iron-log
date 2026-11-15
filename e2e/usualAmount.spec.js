import { test, expect } from './fixtures.js';
import { startFood } from './recipesNav.js';

// Usual amount and unit name on a ready-made food (brief usual-amount-and-unit). The words (egg, eggs, boxes), the validation and the opening amount are node tests
// (foodUnit.test.ts, readyMade.test.ts, dietLog.test.ts, recipes.test.ts); this covers the wiring: the three boxes saving and coming back, the log control opening at the usual
// amount in the person's word, and the Logged line.
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const make = async (page, name, extra = {}) => {
  await openRecipes(page);
  await startFood(page);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Calories per serving').fill('72');
  await page.getByLabel('Protein per serving (g)').fill('6');
  if (extra.usual !== undefined) await page.getByLabel('Usual amount, optional').fill(extra.usual);
  if (extra.unit !== undefined) await page.getByLabel('One serving is called, optional').fill(extra.unit);
  if (extra.plural !== undefined) await page.getByLabel('Plural, only if adding s is wrong').fill(extra.plural);
  await page.getByRole('button', { name: 'Save food' }).click();
};
const amount = page => page.getByRole('status').filter({ hasText: /^[0-9.]+ [a-z ]+$/ });

test('The log control opens at the usual amount in the unit name, and logs it in those words', async ({ page }) => {
  await make(page, 'Egg (large)', { usual: '4', unit: 'egg' });
  await expect(page.getByText('Usual: 4 eggs')).toBeVisible();
  await expect(page.getByText('Per egg: 72 kcal · P 6 g')).toBeVisible();
  await expect(amount(page)).toHaveText('4 eggs');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await expect(amount(page)).toHaveText('4.5 eggs');
  await page.getByRole('button', { name: 'Less' }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.getByText(/Logged .+: 4 eggs to today\./)).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText(/Logged .+: 4 eggs/)).toHaveCount(0);
});

test('the plural box appears with a unit, an odd plural is used, and the three boxes come back on edit', async ({ page }) => {
  await openRecipes(page);
  await startFood(page);
  await expect(page.getByLabel('Plural, only if adding s is wrong')).toHaveCount(0);
  await page.getByLabel('One serving is called, optional').fill('loaf');
  await expect(page.getByLabel('Plural, only if adding s is wrong')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await make(page, 'Bread', { usual: '2', unit: 'loaf', plural: 'loaves' });
  await expect(amount(page)).toHaveText('2 loaves');
  await page.getByRole('button', { name: 'Less' }).click();
  await page.getByRole('button', { name: 'Less' }).click();
  await expect(amount(page)).toHaveText('1 loaf');
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: /Edit/ }).first().click();
  await expect(page.getByLabel('Usual amount, optional')).toHaveValue('2');
  await expect(page.getByLabel('One serving is called, optional')).toHaveValue('loaf');
  await expect(page.getByLabel('Plural, only if adding s is wrong')).toHaveValue('loaves');
  await page.getByLabel('Usual amount, optional').fill('');
  await page.getByLabel('One serving is called, optional').fill('');
  await page.getByRole('button', { name: 'Save food' }).click();
  await expect(amount(page)).toHaveText('1 portion'); // blank boxes: back to the plain wording
  await expect(page.getByText(/^Usual:/)).toHaveCount(0);
});

test('a usual amount off the half steps and a unit with a digit are refused in plain words', async ({ page }) => {
  await make(page, 'Egg', { usual: '2.3' });
  await expect(page.getByRole('alert')).toHaveText('Usual amount must be from 0.5 to 99 in half steps, like 4 or 1.5.');
  await page.getByLabel('Usual amount, optional').fill('4');
  await page.getByLabel('One serving is called, optional').fill('4 eggs');
  await page.getByRole('button', { name: 'Save food' }).click();
  await expect(page.getByRole('alert')).toHaveText('The unit name must be 1 to 20 letters, like egg or slice.');
});
