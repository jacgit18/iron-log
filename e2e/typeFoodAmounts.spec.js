import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, openNutrition, todayCol } from './nutritionBoardHelpers.js';
import { startFood } from './recipesNav.js';

// Brief type-food-amounts: typing vitamin and mineral amounts on a food (admin-only with the Totals sheet). The row-to-amount rules (unit conversion, cap, duplicates, the calorie-change
// rule) are node tests (lib/foodAmountRows.test.ts, store/dietSlice.test.ts); this covers the wiring a node test cannot: the section on the real One-off, edit and Ready-made forms,
// what reaches the saved food log and recipes, and that a person without the feature sees nothing. The fixed clock is Thursday 2026-09-24.
const SPINACH = { ok: true, hits: [{ id: 7, name: 'Spinach', kcal: 100, p: 10, c: 5, f: 1, micro: { calcium: 100, iron: 2 } }] };
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:diet/main') || '{}').items || []);
const recipes = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:recipes/main') || '{}').items || []);

const fillOneOff = async (sheet, kcal = '300') => {
  await sheet.getByLabel('Food', { exact: true }).fill('Burrito bowl');
  await sheet.locator('#dt-add-k').fill(kcal);
  await sheet.locator('#dt-add-p').fill('20');
};

test.describe('admin session', () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true')); await page.reload(); });

  test('a person can type amounts on the One-off form, in any unit, and the eaten food carries them', async ({ page }) => {
    await openNutrition(page);
    const sheet = await openAdd(page, 'One-off food');
    await fillOneOff(sheet);
    const disc = sheet.getByRole('button', { name: /Vitamins and minerals \(optional\)/ });
    await expect(disc).toHaveAttribute('aria-expanded', 'false'); // closed as it opens
    await disc.click();
    await sheet.getByRole('button', { name: '+ Add a nutrient' }).click();
    await sheet.getByLabel('Amount 1').fill('180');
    await sheet.getByRole('button', { name: '+ Add a nutrient' }).click();
    await sheet.getByLabel('Nutrient 2').selectOption({ label: 'Vitamin B12' });
    await sheet.getByLabel('Amount 2').fill('0.01');
    await sheet.getByLabel('Unit 2').selectOption('mg'); // 0.01 mg is 10 mcg
    await sheet.getByRole('button', { name: 'Add', exact: true }).click();
    await closeSheet(page);
    await expect(todayCol(page).locator('.nb-eat')).toContainText(['Burrito bowl']);
    const [e] = await stored(page);
    expect(e.micro).toEqual({ calcium: 180, vitaminB12: 10 });
  });

  test('a food added without rows is unchanged, and a row with no amount is left out', async ({ page }) => {
    await openNutrition(page);
    const sheet = await openAdd(page, 'One-off food');
    await fillOneOff(sheet);
    await sheet.getByRole('button', { name: /Vitamins and minerals \(optional\)/ }).click();
    await sheet.getByRole('button', { name: '+ Add a nutrient' }).click(); // an empty row
    await sheet.getByRole('button', { name: 'Add', exact: true }).click();
    await closeSheet(page);
    const [e] = await stored(page);
    expect('micro' in e).toBe(false);
  });

  test('a lookup fills visible rows; changing calories clears them but keeps a row you typed', async ({ page }) => {
    await page.route('**/api/foods/search*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SPINACH) }));
    await openNutrition(page);
    const sheet = await openAdd(page, 'Find food');
    await sheet.getByRole('searchbox').or(sheet.getByRole('combobox')).first().fill('spinach');
    await sheet.getByRole('button', { name: /Spinach/ }).first().click();
    await sheet.getByLabel('Grams').fill('100');
    await sheet.getByRole('button', { name: 'Use', exact: true }).click();
    await expect(sheet.getByLabel('Amount 1')).toHaveValue('100'); // calcium, open because the food has amounts
    await sheet.getByRole('button', { name: '+ Add a nutrient' }).click();
    await sheet.getByLabel('Nutrient 3').selectOption({ label: 'Zinc' });
    await sheet.getByLabel('Amount 3').fill('1.5'); // typed here
    await sheet.locator('#dt-add-k').fill('120');
    await expect(sheet.getByText('Calories changed: amounts you did not retype were cleared.')).toBeVisible();
    await expect(sheet.getByLabel('Amount 1')).toHaveValue('1.5'); // only the typed zinc row is left
    await sheet.getByRole('button', { name: 'Add', exact: true }).click();
    await closeSheet(page);
    const [e] = await stored(page);
    expect(e.kcal).toBe(120);
    expect(e.micro).toEqual({ zinc: 1.5 });
  });

  test('editing an eaten food shows its amounts and saves exactly the change; removing every row clears them', async ({ page }) => {
    await page.route('**/api/foods/search*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SPINACH) }));
    await openNutrition(page);
    const add = await openAdd(page, 'Find food');
    await add.getByRole('searchbox').or(add.getByRole('combobox')).first().fill('spinach');
    await add.getByRole('button', { name: /Spinach/ }).first().click();
    await add.getByLabel('Grams').fill('100');
    await add.getByRole('button', { name: 'Use', exact: true }).click();
    await add.getByRole('button', { name: 'Add', exact: true }).click();
    await closeSheet(page);
    const [e] = await stored(page);
    await todayCol(page).getByRole('button', { name: /^Edit/ }).first().click();
    await expect(page.getByLabel('Amount 1')).toHaveValue('100');
    await page.getByLabel('Amount 1').fill('150');
    await page.getByRole('button', { name: 'Save' }).click();
    expect((await stored(page))[0].micro).toEqual({ calcium: 150, iron: 2 });
    await todayCol(page).getByRole('button', { name: /^Edit/ }).first().click();
    await page.getByRole('button', { name: 'Remove Calcium row' }).click();
    await page.getByRole('button', { name: 'Remove Iron row' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    expect('micro' in (await stored(page))[0]).toBe(false);
    expect(e.id).toBe((await stored(page))[0].id);
  });

  test('the Ready-made form saves typed amounts per serving', async ({ page }) => {
    await page.click('#tab-daily'); await page.click('#daily-recipes');
    await startFood(page);
    await page.getByLabel('Name').fill('Oat cereal');
    await page.getByLabel('Calories per serving').fill('380');
    await page.getByLabel('Protein per serving (g)').fill('8');
    await page.getByRole('button', { name: /Vitamins and minerals per serving \(optional\)/ }).click();
    await page.getByRole('button', { name: '+ Add a nutrient' }).click();
    await page.getByLabel('Nutrient 1').selectOption({ label: 'Iron' });
    await page.getByLabel('Amount 1').fill('4.5');
    await page.getByRole('button', { name: 'Save food' }).click();
    await expect.poll(async () => (await recipes(page)).length).toBe(1);
    expect((await recipes(page))[0].micro).toEqual({ iron: 4.5 });
  });
});

test.describe('open section, accessibility', () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true')); await page.reload(); });
  for (const scheme of ['light', 'dark']) {
    test(`the open section passes axe in ${scheme} at 375 px with no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.emulateMedia({ colorScheme: scheme });
      await openNutrition(page);
      const sheet = await openAdd(page, 'One-off food');
      await sheet.getByRole('button', { name: /Vitamins and minerals \(optional\)/ }).click();
      await sheet.getByRole('button', { name: '+ Add a nutrient' }).click();
      await sheet.getByLabel('Amount 1').fill('180');
      const scan = await new AxeBuilder({ page }).include('#dt-add-fa').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(scan.violations.map(v => v.id)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
});

test('a person without the feature sees no vitamins and minerals section and the form saves as before', async ({ page }) => {
  await openNutrition(page);
  const sheet = await openAdd(page, 'One-off food');
  await fillOneOff(sheet);
  await expect(sheet.getByRole('button', { name: /Vitamins and minerals/ })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  expect('micro' in (await stored(page))[0]).toBe(false);
});
