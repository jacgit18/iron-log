import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSheet, closeSupplementEditor, openAdd, openNutrition, openSupplementEditor, todayCol } from './nutritionBoardHelpers.js';

// Brief nutrients-without-upper-limit, PR 2 (ADR 108): the five nutrients without an upper limit in the Totals sheet and the supplement form. The sums, the position words and the "never a warning" rule are
// node tests (nutrientTargetTotals.test.ts); this covers the wiring a node test cannot: the form offering the five, a supplement and a food found by name adding up in a "No upper limit" section, sodium's
// wording, no warning line and no over-limit colour however high, and axe at phone width in both themes. Open to everyone since 2026-11-09 (the `supplementTotals` flag is gone). The fixed clock is Thursday 2026-09-24.
const dialog = page => page.getByRole('dialog');
const FOOD = { ok: true, hits: [{ id: 7, name: 'Spinach', kcal: 100, p: 10, c: 5, f: 1, micro: { potassium: 500, sodium: 3000, fiber: 2.2 } }] };

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true')); await page.reload(); });

async function addSupplement(page, name, rows) {
  await page.locator('#suplib-add').click(); await page.locator('#suppadd-full').click();
  await page.locator('#supp-name').fill(name);
  for (const [i, [nutrient, amount, unit]] of rows.entries()) {
    await page.locator('#supp-add-nutrient').click();
    await page.getByLabel(`Nutrient ${i + 1}`).selectOption({ label: nutrient });
    await page.getByLabel(`Amount ${i + 1}`).fill(String(amount));
    await page.getByLabel(`Unit ${i + 1}`).selectOption(unit);
  }
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#sched-h')).toBeVisible();
}
async function eatSpinach(page) {
  await page.route('**/api/foods/search*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FOOD) }));
  const sheet = await openAdd(page, 'Find food');
  await sheet.getByRole('searchbox').or(sheet.getByRole('combobox')).first().fill('spinach');
  await sheet.getByRole('button', { name: /Spinach/ }).first().click();
  await sheet.getByLabel('Grams').fill('100');
  await sheet.getByRole('button', { name: 'Use', exact: true }).click();
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
}
async function setUp(page) {
  await openNutrition(page);
  await openSupplementEditor(page);
  await addSupplement(page, 'Fiber mix', [['Fiber', 5, 'g'], ['Vitamin B12', 500, 'mcg']]);
  await closeSupplementEditor(page);
  await todayCol(page).getByLabel('Fiber mix', { exact: false }).first().check();
  await eatSpinach(page);
}

test('the supplement form groups all 28 nutrients under Vitamins, Minerals and Other', async ({ page }) => {
  await openNutrition(page);
  await openSupplementEditor(page);
  await page.locator('#suplib-add').click(); await page.locator('#suppadd-full').click();
  await page.locator('#supp-add-nutrient').click();
  const select = page.getByLabel('Nutrient 1');
  expect(await select.locator('option').count()).toBe(28);
  expect(await select.locator('optgroup').evaluateAll(gs => gs.map(g => g.label))).toEqual(['Vitamins', 'Minerals', 'Other']);
  const last = await select.locator('optgroup').last().locator('option').allTextContents();
  expect(last).toEqual(['Choline', 'Fiber']);
  // a second row starts on a nutrient the item does not have yet; choosing one it already has (with amounts) says it is listed twice
  const dupNote = async nutrient => {
    await page.locator(nutrient).click();
    expect(await page.getByLabel('Nutrient 2').inputValue()).not.toBe(await page.getByLabel('Nutrient 1').inputValue());
    await page.getByLabel('Amount 1').fill('5'); await page.getByLabel('Amount 2').fill('5');
    await page.getByLabel('Nutrient 2').selectOption(await page.getByLabel('Nutrient 1').inputValue());
    await expect(page.getByText(/is listed twice; only the first is kept/)).toBeVisible();
  };
  await dupNote('#supp-add-nutrient');
  await page.getByRole('button', { name: 'Cancel' }).click();
  // the One-off food form's vitamin and mineral picker offers the same 28, grouped the same way
  await closeSupplementEditor(page);
  const sheet = await openAdd(page, 'One-off food');
  await sheet.getByRole('button', { name: /^Vitamins and minerals/ }).click();
  await sheet.getByRole('button', { name: '+ Add a nutrient' }).click();
  const food = sheet.getByLabel('Nutrient 1');
  expect(await food.locator('option').count()).toBe(28);
  expect(await food.locator('optgroup').evaluateAll(gs => gs.map(g => g.label))).toEqual(['Vitamins', 'Minerals', 'Other']);
  await dupNote('button:has-text("+ Add a nutrient")');
});

test('a supplement and a food add up under No upper limit, in words, with no warning and no over-limit colour', async ({ page }) => {
  await setUp(page);
  const col = todayCol(page);
  await expect(col.locator('.nb-suppwarn')).toHaveCount(0); // 500 mcg of B12 and 3,000 mg of sodium are far above their recommended figures, and neither is a warning
  await col.getByRole('button', { name: /^Totals for/ }).click();
  const s = dialog(page);
  await expect(s.getByRole('heading', { name: 'No upper limit' })).toBeVisible();
  await expect(s.locator('#stt-fiber')).toContainText('7.2 g'); // 5 g supplement + 2.2 g food
  await expect(s.locator('#stt-fiber')).toContainText('Below the recommended range'); // 7.2 g is under the 21 g lowest adult figure
  await expect(s.locator('#stt-fiber')).toContainText('Supplements 5 g, food 2.2 g.');
  await expect(s.locator('#stt-potassium')).toContainText('Below the recommended range');
  await expect(s.locator('#stt-vitaminB12')).toContainText('500 mcg');
  await expect(s.locator('#stt-vitaminB12')).toContainText('of the recommended amount'); // 500 mcg is far above 2.4 mcg, and the words say a share, not a warning
  await expect(s.locator('#stt-sodium')).toContainText('Above the 2,300 mg level to stay under by 700 mg');
  await expect(s.locator('#stt-sodium')).toContainText('not an upper limit');
  await expect(s.locator('#stt-targets .stt-row.over, #stt-targets .stt-row.close')).toHaveCount(0);
  await expect(s.locator('#stt-targets')).toContainText('General information, not medical advice.');
});

test('the totals sheet with the new section has no axe violations in either theme at 375 px and does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await setUp(page);
  await todayCol(page).getByRole('button', { name: /^Totals for/ }).click();
  await expect(dialog(page).locator('#stt-sodium')).toBeVisible();
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
});
