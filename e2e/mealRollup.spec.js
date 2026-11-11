import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { startRecipe, unfoldAll } from './recipesNav.js';

// Meals built from foods (brief meals-from-foods). The rules (roll-up, loops, depth, rename and delete, the cleaner) are node tests
// (mealRollup.test.ts, mealsFromFoods.test.ts, shared/recipes.test.ts); this covers the wiring they cannot see: the picker, the amount
// stepper, the live numbers and the switch in the form, and the numbers and the counted line on the recipe's page.
const rc = (id, n, cat, extra = {}) => ({ id, n, cat, ing: [], steps: [], ...extra });
const oats = rc('oats', 'Oat cereal', 'ready', { type: 'ingredient', kcal: 150, p: 5, c: 27, f: 3 });
const milk = rc('milk', 'Whole milk', 'ready', { type: 'drink', kcal: 150, p: 8, c: 12, f: 8 });
const bare = rc('bare', 'Mystery food', 'ready', { type: 'ingredient' });
const seed = async (page, list) => {
  await page.addInitScript(l => { if (localStorage.getItem('ironlog:recipes/main') === null) localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })); }, list);
  await page.reload(); // the fixture has already loaded the page once
};
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };

test('a bowl built from two foods rolls up in the form, on save and on its page, and the switch keeps typed numbers', async ({ page }) => {
  await seed(page, [oats, milk, bare]);
  await openRecipes(page);
  await startRecipe(page);
  await page.getByLabel('Name', { exact: true }).fill('Cereal bowl');
  await page.getByRole('button', { name: '+ Food or meal' }).click();
  const list = page.getByRole('group', { name: 'Foods and meals' });
  await expect(list.getByLabel('Search your foods and meals')).toBeFocused();
  await expect(list.locator('.rc-saucerow b')).toHaveText(['Mystery food', 'Oat cereal', 'Whole milk']);
  await list.getByLabel('Search your foods and meals').fill('oat');
  await list.getByRole('button', { name: /Oat cereal/ }).click();
  await expect(list).toHaveCount(0);
  await expect(page.getByLabel('Ingredient 1', { exact: true })).toHaveValue('Oat cereal'); // it filled the empty first row
  await page.getByRole('button', { name: 'More Oat cereal' }).click();
  await expect(page.getByRole('group', { name: 'Amount of Oat cereal' }).locator('output')).toHaveText('1.5 portions');
  await page.getByRole('button', { name: '+ Food or meal' }).click();
  await page.getByRole('group', { name: 'Foods and meals' }).getByRole('button', { name: /Whole milk/ }).click();
  const roll = page.locator('.rc-roll');
  await expect(roll).toContainText('Per serving, from the parts: 375 kcal · 15.5 g protein · 52.5 g carbs · 12.5 g fat');
  await expect(roll).toContainText('2 of 2 ingredients counted');
  await page.getByRole('button', { name: '+ Food or meal' }).click();
  await page.getByRole('group', { name: 'Foods and meals' }).getByRole('button', { name: /Mystery food/ }).click();
  await expect(roll).toContainText('2 of 3 ingredients counted, needs numbers: Mystery food');
  await page.getByRole('button', { name: 'Remove ingredient 3' }).click();
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByText('Per serving, from the parts: 375 kcal · 15.5 g protein')).toBeVisible();
  await expect(page.locator('.rc-ing', { hasText: '1.5 portions Oat cereal' })).toBeVisible();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await unfoldAll(page);
  await page.getByLabel('Use my own numbers').check();
  await expect(roll).toContainText('From the parts: 375 kcal');
  await page.getByLabel('Calories per serving').fill('700');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByText('Your own numbers are used. The parts add up to 375 kcal')).toBeVisible();
});

test('a loop is refused in the picker with a message, and the form stays usable', async ({ page }) => {
  await seed(page, [oats, rc('a', 'Lunch box', 'other', { ing: [{ n: 'Sandwich', rid: 'b', q: 1 }] }), rc('b', 'Sandwich', 'other', { ing: [{ n: 'Oat cereal', rid: 'oats', q: 1 }] })]);
  await openRecipes(page);
  await page.getByRole('button', { name: /Sandwich/ }).first().click();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await unfoldAll(page);
  await page.getByRole('button', { name: '+ Food or meal' }).click();
  const list = page.getByRole('group', { name: 'Foods and meals' });
  await expect(list.locator('.rc-saucerow b')).toHaveText(['Oat cereal', 'Lunch box']); // never the recipe itself
  await list.getByRole('button', { name: /Lunch box/ }).click();
  await expect(list.getByRole('alert')).toContainText('already contains this meal, so that would loop');
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
});

test('on a phone the picker, the amount stepper and the switch fit and every target is at least 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await seed(page, [oats, milk]);
  await openRecipes(page);
  await startRecipe(page);
  await page.getByRole('button', { name: '+ Food or meal' }).click();
  await page.getByRole('group', { name: 'Foods and meals' }).getByRole('button', { name: /Oat cereal/ }).click();
  const small = await page.locator('.rc-form button, .rc-form input:not([type=hidden])').evaluateAll(els => els
    .filter(e => e.offsetParent !== null && e.getBoundingClientRect().height > 0 && (e.getBoundingClientRect().height < 43.5 || (e.type !== 'checkbox' && e.getBoundingClientRect().width < 43.5)))
    .map(e => `${e.getAttribute('aria-label') ?? e.textContent?.trim() ?? e.id}: ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
  expect(small.filter(t => /food|meal|amount|oat|Less|More|own numbers/i.test(t))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
