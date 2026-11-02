import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// The recipe form (brief recipe-form-mobile-desktop): the amount picker, the typed list, Alternative, the folded Nutrition card, servings starting at
// 1, and the phone and wide layouts. The rules (composing an amount, reading a list) are node tests (amountPicker.test.ts, ingredientList.test.ts);
// this covers the wiring and the layout, which a node test cannot see.
const open = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); await page.getByRole('button', { name: 'New recipe' }).click(); };
const amountBtn = (page, i) => page.getByRole('button', { name: new RegExp(`^Amount for ingredient ${i + 1}:`) });
const noViolations = async page => {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
};

test('a new recipe starts at 1 serving, and 4 servings rewrites the amounts', async ({ page }) => {
  await open(page);
  const servings = page.getByLabel('Servings', { exact: true });
  await expect(servings).toHaveValue('1');
  await expect(page.getByText('Amounts are for 1 serving.')).toBeVisible();
  await amountBtn(page, 0).click();
  await page.getByRole('button', { name: 'More', exact: true }).click(); // 1 -> 2
  await page.getByRole('button', { name: '½', exact: true }).click();
  await page.getByRole('button', { name: 'cup', exact: true }).click();
  await expect(page.getByRole('group', { name: /^Amount for/ }).locator('output').first()).toHaveText('2½ cups');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(amountBtn(page, 0)).toHaveText('2½ cups');
  await servings.fill('2');
  await expect(amountBtn(page, 0)).toHaveText('5 cups');
  await expect(page.getByText('Amounts are for 2 servings.')).toBeVisible();
});

test('the picker keeps typed text, clears, closes on Escape without writing, and remembers recent amounts', async ({ page }) => {
  await open(page);
  await amountBtn(page, 0).click();
  await page.getByLabel('Type an amount instead').fill('to taste');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(amountBtn(page, 0)).toHaveText('to taste');
  await amountBtn(page, 0).click(); // reopened: the text is shown as typed, and Done without a change leaves it
  await expect(page.getByLabel('Type an amount instead')).toHaveValue('to taste');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(amountBtn(page, 0)).toHaveText('to taste');
  await amountBtn(page, 0).click();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(amountBtn(page, 0)).toHaveText('to taste');
  await expect(page.getByRole('group', { name: /^Amount for/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  await amountBtn(page, 1).click();
  // typing something and then deleting it is no typed text: Done writes what the chips show (the amount opens at 1), not an empty amount
  await page.getByLabel('Type an amount instead').fill('abc');
  await page.getByLabel('Type an amount instead').fill('');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(amountBtn(page, 1)).toHaveText('1');
  await amountBtn(page, 1).click();
  await expect(page.getByRole('button', { name: 'to taste', exact: true })).toBeVisible(); // under Recent
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(amountBtn(page, 1)).toHaveText('Amount');
});

test('Type a list reads amounts and "or" alternatives into rows, and the rows come back as the same text', async ({ page }) => {
  await open(page);
  await page.getByLabel('Name', { exact: true }).fill('Oats');
  await page.getByRole('button', { name: 'Type a list' }).click();
  await page.getByLabel(/^One ingredient per line/).fill('1 cup rolled oats\n1 cup milk or oat milk\npinch salt');
  await expect(page.getByLabel('What was read').locator('li')).toHaveCount(3);
  await page.getByRole('button', { name: 'Use these ingredients' }).click();
  await expect(page.getByLabel('Ingredient 2', { exact: true })).toHaveValue('milk');
  await expect(page.getByLabel('Alternative for ingredient 2')).toHaveValue('oat milk');
  await expect(amountBtn(page, 2)).toHaveText('pinch');
  await page.getByRole('button', { name: 'Type a list' }).click();
  await expect(page.getByLabel(/^One ingredient per line/)).toHaveValue('1 cup rolled oats\n1 cup milk or oat milk\npinch salt');
  await page.getByRole('button', { name: 'Save recipe' }).click(); // saving from the list is the same as using it
  await expect(page.getByText('(or oat milk)')).toBeVisible();
  await expect(page.getByText('1 cup rolled oats')).toBeVisible();
});

test('Type a list keeps the rows of lines you did not change, and the pin and Skip with them', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('ironlog:recipes/main')) localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: [{ id: 'sauce-1', n: 'Sauce', cat: 'other', ing: [{ n: 'tomatoes', amt: '1 (14 oz) can' }, { n: 'salt or pepper', amt: '1 tsp', skip: true }, { n: 'garlic', amt: '2 cloves' }], steps: ['Cook.'] }] }));
  });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.getByRole('button', { name: /^Sauce Custom/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Type a list' }).click();
  await page.getByLabel(/^One ingredient per line/).fill('1 (14 oz) can tomatoes\n1 tsp salt or pepper\n3 cloves garlic');
  await page.getByRole('button', { name: 'Use these ingredients' }).click();
  await expect(amountBtn(page, 0)).toHaveText('1 (14 oz) can'); // not read as "1"
  await expect(page.getByLabel('Ingredient 2', { exact: true })).toHaveValue('salt or pepper'); // not split into an Alternative
  await expect(page.getByLabel('Alternative for ingredient 2')).toHaveValue('');
  await expect(page.getByText('Skipped.')).toBeVisible(); // the stored skip stayed with its row
  await expect(amountBtn(page, 2)).toHaveText('3 cloves'); // the changed line was read again
});

test('an empty list says so instead of clearing the rows', async ({ page }) => {
  await open(page);
  await page.getByLabel('Ingredient 1', { exact: true }).fill('flour');
  await page.getByRole('button', { name: 'Type a list' }).click();
  await page.getByLabel(/^One ingredient per line/).fill('');
  await page.getByRole('button', { name: 'Use these ingredients' }).click();
  await expect(page.getByText('Type at least one ingredient first.')).toBeVisible();
});

test('Nutrition per serving is folded away, shows its summary, and opens with Edit', async ({ page }) => {
  await open(page);
  await expect(page.getByLabel('Calories per serving')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit nutrition per serving' }).click();
  await page.getByLabel('Calories per serving').fill('420');
  await page.getByLabel('Protein per serving (g)').fill('32');
  await page.getByRole('button', { name: 'Done with nutrition per serving' }).click();
  await expect(page.getByText('420 kcal · 32 g protein')).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('Alternative is a link, rows fit, nothing scrolls sideways, and every control is 44px', async ({ page }) => {
    await open(page);
    await expect(page.getByLabel('Alternative for ingredient 1')).toBeHidden();
    await page.getByRole('button', { name: '+ Alternative' }).click();
    await expect(page.getByLabel('Alternative for ingredient 1')).toBeFocused();
    await amountBtn(page, 0).click();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(wide).toBe(false);
    const small = await page.evaluate(() => [...document.querySelectorAll('.rc-form button, .rc-form input, .rc-form select')]
      .filter(e => e.offsetParent && !e.closest('[hidden]')).map(e => ({ n: e.getAttribute('aria-label') || e.textContent.trim() || e.className, h: e.getBoundingClientRect().height })).filter(x => x.h < 43.5));
    expect(small).toEqual([]);
    await noViolations(page);
  });
});

test.describe('on a phone, a recipe with an Alternative', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('clearing the stored Alternative keeps the field open to type another', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('ironlog:recipes/main')) localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: [{ id: 'oats-1', n: 'Oats', cat: 'other', ing: [{ n: 'milk', amt: '1 cup', sub: 'oat milk' }], steps: ['Mix.'] }] }));
    });
    await page.reload();
    await page.click('#tab-daily'); await page.click('#daily-recipes');
    await page.getByRole('button', { name: /Oats/ }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const alt = page.getByLabel('Alternative for ingredient 1');
    await alt.fill('');
    await expect(alt).toBeVisible();
    await alt.fill('soy milk');
    await expect(alt).toHaveValue('soy milk');
  });
});

test.describe('on a wide screen', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test('the basics and the ingredients sit side by side, and Alternative is a column', async ({ page }) => {
    await open(page);
    const name = await page.getByLabel('Name', { exact: true }).boundingBox();
    const ing = await page.getByLabel('Ingredient 1', { exact: true }).boundingBox();
    expect(ing.x).toBeGreaterThan(name.x + name.width);
    await expect(page.getByLabel('Alternative for ingredient 1')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Alternative' })).toBeHidden();
    const alt = await page.getByLabel('Alternative for ingredient 1').boundingBox();
    expect(Math.abs(alt.y - ing.y)).toBeLessThan(4); // same line as the name
    await noViolations(page);
  });
});
