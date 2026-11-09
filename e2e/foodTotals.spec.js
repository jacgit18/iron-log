import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSheet, closeSupplementEditor, openAdd, openNutrition, openSupplementEditor, todayCol } from './nutritionBoardHelpers.js';

// Brief food-vitamins-minerals, PR B: food joins the vitamin and mineral totals. The sums, the scope rule (food added only where the limit counts food), the coverage count and the warning are node
// tests (foodTotals.test.ts, supplementNutrients.test.ts); this covers the wiring a node test cannot: a food found by name logged through the real sheets, the Totals link on a day with no scheduled
// supplement, the rows and words in the sheet, the warning under the ticks, and axe at phone width in both themes. Admin-only for now (src/features.ts `supplementTotals`). The fixed clock is Thursday 2026-09-24.
const dialog = page => page.getByRole('dialog');
const FOOD = { ok: true, hits: [{ id: 7, name: 'Spinach', kcal: 100, p: 10, c: 5, f: 1, micro: { zinc: 5, magnesium: 120 } }] };

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true')); await page.reload(); });

async function addSupplement(page, name, nutrient, amount) {
  await page.locator('#suplib-new').click();
  await page.locator('#supp-name').fill(name);
  await page.locator('#supp-add-nutrient').click();
  await page.getByLabel('Nutrient 1').selectOption({ label: nutrient });
  await page.getByLabel('Amount 1').fill(String(amount));
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

test('food adds to a limit that counts food, sits beside one that does not, and the warning follows the combined total', async ({ page }) => {
  await openNutrition(page);
  await openSupplementEditor(page);
  await addSupplement(page, 'Zinc cap', 'Zinc', 38);
  await addSupplement(page, 'Mag cap', 'Magnesium', 300);
  await closeSupplementEditor(page);
  const col = todayCol(page);
  await col.getByLabel('Zinc cap', { exact: false }).first().check();
  await col.getByLabel('Mag cap', { exact: false }).first().check();
  await expect(col.locator('.nb-suppwarn')).toHaveCount(0); // 38 of 40 mg of zinc, supplements alone
  await eatSpinach(page);
  await expect(col.locator('.nb-suppwarn')).toContainText('Over an upper limit today: Zinc'); // 38 + 5 = 43 mg
  await col.getByRole('button', { name: /^Totals for/ }).click();
  const s = dialog(page);
  await expect(s.locator('#stt-coverage')).toHaveText('Food: 1 of 1 eaten food had vitamin or mineral data.');
  await expect(s.locator('#stt-zinc')).toContainText('43 mg');
  await expect(s.locator('#stt-zinc')).toContainText('Over the limit by 3 mg');
  await expect(s.locator('#stt-zinc')).toContainText('Supplements 38 mg, food 5 mg.');
  await expect(s.locator('#stt-magnesium')).toContainText('300 mg'); // food's 120 mg is not added: that limit counts supplements only
  await expect(s.locator('#stt-magnesium')).toContainText('Food 120 mg is not added: this limit counts supplements only.');
  await expect(s).toContainText('not medical advice');
});

test('a day with food data and no scheduled supplement still has Totals, and the foods without data are counted', async ({ page }) => {
  await openNutrition(page);
  await eatSpinach(page);
  await page.locator('#nb-add').click();
  await dialog(page).getByRole('button', { name: /^One-off food/ }).click();
  await page.locator('#dt-add-n').fill('Plain rice');
  await page.locator('#dt-add-k').fill('200');
  await page.locator('#dt-add-p').fill('4');
  await dialog(page).getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  await todayCol(page).getByRole('button', { name: /^Totals for/ }).click();
  const s = dialog(page);
  await expect(s.locator('#stt-coverage')).toContainText('Food: 1 of 2 eaten foods had vitamin or mineral data. Foods without data add nothing');
  await expect(s.locator('#stt-zinc')).toContainText('5 mg');
  await expect(s.locator('#stt-zinc')).toContainText('Supplements 0 mg, food 5 mg.');
});

test('the totals sheet with food has no axe violations in either theme at 375 px and does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openNutrition(page);
  await eatSpinach(page);
  await todayCol(page).getByRole('button', { name: /^Totals for/ }).click();
  await expect(dialog(page).locator('#stt-magnesium')).toContainText('is not added');
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
});
