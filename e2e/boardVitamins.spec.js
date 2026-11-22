import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Brief recipe-auto-nutrition, PR 2 (display): the vitamins line on a planned card and an eaten row, the top five when opened, the Estimated mark, the folded bars on a recipe's own page and the estimated share in the day line and Totals.
// The ranking, the shares, the mark rules and the words are node tests (microLine, recipeMicroRows, supplementTotalsView, dayNutrientMeter, recipeDraft, dietLog tests); this covers the wiring a node test cannot see: where each line sits on the real
// board, the open states, the page control against the meal bars, and axe at 375 px in both themes. The fixed clock is Thursday 2026-09-24.
const TODAY = '2026-09-24', TOMORROW = '2026-09-25';
// Shares of a day's highest adult recommended amount: manganese 1.15 of 2.3 = 50%, zinc 3.3 of 11 = 30%, vitamin C 18 of 90 = 20%, iron 1.8 of 18 = 10%, selenium 5.5 of 55 = 10%, vitamin B6 0.085 of 1.7 = 5%.
const MICRO = { manganese: 1.15, zinc: 3.3, vitaminC: 18, iron: 1.8, selenium: 5.5, vitaminB6: 0.085 };
const mk = (id, n, extra = {}) => ({ id, n, cat: 'other', ing: [{ n: 'x' }], steps: ['Cook.'], kcal: 400, p: 20, ...extra });
const EST = mk('est', 'Oat bowl', { micro: MICRO, est: { of: 3, n: 4 } });
const PLAIN = mk('plain', 'Plain stew', { micro: MICRO });
const NONE = mk('none', 'Dry toast');
const READY = mk('ready', 'Protein bar', { cat: 'ready', type: 'ready', ing: [], steps: [], micro: MICRO });
const CEREAL = mk('cereal', 'Oat cereal', { cat: 'ready', type: 'ingredient', ing: [], steps: [], micro: { calcium: 100, vitaminD: 1 } });
const MILK = mk('milk', 'Whole milk', { cat: 'ready', type: 'drink', ing: [], steps: [], micro: { calcium: 300, vitaminD: 2.9 } });
const BOWL = mk('bowl', 'Cereal bowl', { cat: 'breakfast', ing: [{ n: 'Oat cereal', rid: 'cereal', q: 1 }, { n: 'Whole milk', rid: 'milk', q: 1 }] });
const seed = async (page, recipes, diet = []) => {
  await page.evaluate(([r, d]) => { localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: r })); localStorage.setItem('ironlog:diet/main', JSON.stringify({ items: d })); }, [recipes, diet]);
  await page.reload();
};
const col = (page, day) => page.locator(`.nb-col[data-day="${day}"]`);
const planTomorrow = async (page, name) => {
  await col(page, TOMORROW).locator('.nb-dayname').click();
  const sheet = await openAdd(page, 'Recipes');
  await sheet.getByRole('group', { name: 'Which meal' }).getByRole('button', { name: 'Dinner', exact: true }).click();
  await sheet.getByRole('button', { name: `Plan ${name} for Dinner` }).click();
  await closeSheet(page);
};
const openRecipePage = async (page, name) => {
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
};

test.describe('planned card', () => {
  test('shows the top two under the macro line, the top five when opened, and Estimated for an estimated recipe', async ({ page }) => {
    await seed(page, [EST, PLAIN, NONE]);
    await openNutrition(page);
    for (const n of ['Oat bowl', 'Plain stew', 'Dry toast']) await planTomorrow(page, n);
    const tomorrow = col(page, TOMORROW);
    const est = tomorrow.locator('.wb-cardwrap', { hasText: 'Oat bowl' });
    await expect(est.locator('.nb-micro')).toHaveText('Manganese 50% · Zinc 30% · Estimated');
    await expect(tomorrow.locator('.wb-cardwrap', { hasText: 'Plain stew' }).locator('.nb-micro')).toHaveText('Manganese 50% · Zinc 30%'); // no mark without est
    await expect(tomorrow.locator('.wb-cardwrap', { hasText: 'Dry toast' }).locator('.nb-micro')).toHaveCount(0); // no micro, no line
    await expect(est.locator('.nb-microlist')).toHaveCount(0);
    await est.locator('.wb-card').click();
    const items = est.locator('.nb-microlist li');
    await expect(items).toHaveCount(5);
    await expect(items.first()).toHaveText('Manganese 1.15 mg, 50% of a day');
    await expect(est.locator('.nb-microlist')).not.toContainText('B6'); // the sixth is not listed
    await expect(est.locator('.nb-microlist .note')).toContainText('Estimated');
  });

  test('scales by the portion: More doubles the shares', async ({ page }) => {
    await seed(page, [PLAIN]);
    await openNutrition(page);
    await planTomorrow(page, 'Plain stew');
    const card = col(page, TOMORROW).locator('.wb-cardwrap', { hasText: 'Plain stew' });
    await card.locator('.wb-card').click();
    await card.getByRole('button', { name: 'More Plain stew' }).click();
    await expect(card.locator('.nb-micro')).toHaveText('Manganese 75% · Zinc 45%'); // 1.5 portions
  });
});

test.describe('eaten row', () => {
  const ENTRY = (extra = {}) => ({ id: 'e1', d: TODAY, n: 'Oat bowl', kcal: 400, p: 20, from: 'est', micro: MICRO, ...extra });
  test('shows the top two with the mark; the row sheet lists five; an entry with no vitamins shows no line', async ({ page }) => {
    await seed(page, [EST], [ENTRY({ est: true }), { id: 'e2', d: TODAY, n: 'Tea', kcal: 5, p: 0 }, ENTRY({ id: 'e3', n: 'Plain bowl', from: undefined })]);
    await openNutrition(page);
    const row = todayCol(page).locator('.nb-eat', { hasText: 'Oat bowl' });
    await expect(row.locator('.nb-micro')).toHaveText('Manganese 50% · Zinc 30% · Estimated');
    await expect(todayCol(page).locator('.nb-eat', { hasText: 'Plain bowl' }).locator('.nb-micro')).toHaveText('Manganese 50% · Zinc 30%');
    await expect(todayCol(page).locator('.nb-eat', { hasText: 'Tea' }).locator('.nb-micro')).toHaveCount(0);
    await row.locator('.nb-eatrow').click();
    const sheet = page.getByRole('dialog', { name: 'Oat bowl' });
    await expect(sheet.locator('.nb-microlist li')).toHaveCount(5);
    await expect(sheet.locator('.nb-microlist .note')).toContainText('Estimated');
  });
});

test.describe('recipe page', () => {
  test('a recipe with its own vitamins shows the folded control and one bar per nutrient', async ({ page }) => {
    await seed(page, [PLAIN, EST]);
    await openRecipePage(page, 'Plain stew');
    const toggle = page.locator('.rmi-toggle');
    await expect(toggle).toHaveText('Vitamins and minerals: 6 listed');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.rmi-row')).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.rmi-row')).toHaveCount(6);
    await expect(page.locator('.rmi-row').first()).toContainText('Manganese');
    await expect(page.locator('.rmi-row').first()).toContainText('1.15 mg');
    await expect(page.locator('.rmi-row').first().getByRole('img')).toHaveAttribute('aria-label', "Manganese per serving: 1.15 mg, 50% of a day's recommended amount.");
    await expect(page.locator('.rmi-panel .note')).not.toContainText('Estimated');
    await toggle.click();
    await expect(page.locator('.rmi-row')).toHaveCount(0);
  });

  test('an estimated recipe says so; a ready-made food has the control too; a recipe with none has nothing', async ({ page }) => {
    await seed(page, [EST, READY, NONE]);
    await openRecipePage(page, 'Oat bowl');
    await page.locator('.rmi-toggle').click();
    await expect(page.locator('.rmi-panel .note')).toContainText('Estimated: worked out from 3 of 4 ingredients');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: /Protein bar/ }).first().click();
    await expect(page.locator('.rmi-toggle')).toHaveText('Vitamins and minerals: 6 listed');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: /Dry toast/ }).first().click();
    await expect(page.locator('.rmi')).toHaveCount(0);
  });

  test('a meal built from linked foods keeps today’s part-by-part bars, not the new control', async ({ page }) => {
    await seed(page, [CEREAL, MILK, BOWL]);
    await openRecipePage(page, 'Cereal bowl');
    await expect(page.locator('.mmb-toggle')).toHaveText(/Vitamins and minerals: \d+ listed/);
    await expect(page.locator('.rmi')).toHaveCount(0);
  });
});

test.describe('estimated share in the day line and Totals', () => {
  test('the open day line says part is estimated, and the Totals row gives the estimated amount', async ({ page }) => {
    await seed(page, [EST], [{ id: 'e1', d: TODAY, n: 'Oat bowl', kcal: 400, p: 20, from: 'est', micro: MICRO, est: true }, { id: 'e2', d: TODAY, n: 'Rice', kcal: 200, p: 4, micro: { manganese: 0.8 } }]);
    await openNutrition(page);
    const c = todayCol(page);
    await c.locator('.nb-vit-tog').click();
    await expect(c.locator('.nb-vit-estnote')).toHaveText('Part of this is estimated from recipes (the hatched part of a bar).');
    await expect(c.locator('.nb-vit-est')).toHaveCount(5); // every nutrient the marked entry lists (the five bars shown)
    await expect(c.getByRole('img', { name: /^Manganese: 1\.95 mg\..*Part of this is estimated from recipes/ })).toBeVisible();
    await c.getByRole('button', { name: /^(Open Totals|All \d+ in Totals)$/ }).click();
    await expect(page.getByRole('dialog').locator('#stt-manganese .stt-food')).toHaveText('Supplements 0 mg, food 1.95 mg (1.15 mg of it estimated from recipes).');
  });

  test('without a marked entry the line and the sheet read as before', async ({ page }) => {
    await seed(page, [PLAIN], [{ id: 'e1', d: TODAY, n: 'Plain stew', kcal: 400, p: 20, from: 'plain', micro: MICRO }]);
    await openNutrition(page);
    await todayCol(page).locator('.nb-vit-tog').click();
    await expect(todayCol(page).locator('.nb-vit-estnote')).toHaveCount(0);
    await expect(todayCol(page).locator('.nb-vit-est')).toHaveCount(0);
  });
});

for (const scheme of ['light', 'dark']) {
  test(`no axe violations on the lines, the opened card and the page control (${scheme}; the page at 375 px)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await seed(page, [EST], [{ id: 'e1', d: TODAY, n: 'Oat bowl', kcal: 400, p: 20, from: 'est', micro: MICRO, est: true }]);
    await openNutrition(page);
    await planTomorrow(page, 'Oat bowl');
    await col(page, TOMORROW).locator('.wb-cardwrap', { hasText: 'Oat bowl' }).locator('.wb-card').click();
    expect((await new AxeBuilder({ page }).include('.nb-col').exclude('.wb-acts').analyze()).violations).toEqual([]);
    await page.setViewportSize({ width: 375, height: 800 });
    await expect(page.locator('.nb-micro:visible').first()).toBeVisible(); // the phone shows the selected day (tomorrow, with the planned card)
    expect((await new AxeBuilder({ page }).include('.nb-col').exclude('.wb-acts').analyze()).violations).toEqual([]);
    await openRecipePage(page, 'Oat bowl');
    await page.locator('.rmi-toggle').click();
    expect((await new AxeBuilder({ page }).include('.rmi').analyze()).violations).toEqual([]);
  });
}
