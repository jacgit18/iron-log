import { test, expect } from './fixtures.js';
import { closeSheet, closeSupplementEditor, openAdd, openNutrition, openSupplementEditor, todayCol, openDayTotals } from './nutritionBoardHelpers.js';

// Brief intake-target-and-safety-checks, PR 2: the Totals sheet's separate target line, the 7-day average, the disclaimer and the form hint. Every rule (below, meets and above, scope, the average's
// days, the banned words) is a node test (lib/intakeChecks.test.ts, lib/intakeSheet.test.ts); this covers the wiring a node test cannot: the lines on the real sheet, a food logged through the real sheets
// moving the target line from absent to present, and the hint on the supplement form. Open to everyone since 2026-11-09 (the `supplementTotals` flag is gone). The fixed clock is Thursday 2026-09-24.
const dialog = page => page.getByRole('dialog');
const FOOD = { ok: true, hits: [{ id: 7, name: 'Spinach', kcal: 100, p: 10, c: 5, f: 1, micro: { zinc: 5 } }] };

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true')); await page.reload(); });

test('the form says to enter the elemental amount', async ({ page }) => {
  await openNutrition(page);
  await openSupplementEditor(page);
  await page.locator('#suplib-add').click(); await page.locator('#suppadd-full').click();
  await expect(dialog(page)).toContainText('Enter the elemental amount the Supplement Facts panel lists (for example magnesium, not magnesium oxide).');
});

test('supplements alone show an average and no target verdict; a logged food adds the target line, apart from the limit words', async ({ page }) => {
  await openNutrition(page);
  await openSupplementEditor(page);
  await page.locator('#suplib-add').click(); await page.locator('#suppadd-full').click();
  await page.locator('#supp-name').fill('Zinc cap');
  await page.locator('#supp-add-nutrient').click();
  await page.getByLabel('Nutrient 1').selectOption({ label: 'Zinc' });
  await page.getByLabel('Amount 1').fill('5');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#sched-h')).toBeVisible();
  await closeSupplementEditor(page);
  const col = todayCol(page);
  await col.getByLabel('Zinc cap', { exact: false }).first().check();
  await openDayTotals(col);
  const s = dialog(page);
  await expect(s.locator('#stt-zinc')).toContainText('13% of the limit'); // 5 of 40 mg, 12.5 rounds up
  await expect(s.locator('#stt-zinc .stt-avg')).toHaveText('7-day average: 5 mg (1 day with data)');
  await expect(s.locator('#stt-zinc .stt-target')).toHaveCount(0); // no food yet: supplements alone cannot say below
  await expect(s.locator('.stt-foot')).toContainText('It does not account for pregnancy, breastfeeding, medicines or health conditions');
  await s.getByRole('button', { name: 'Done' }).click();
  await page.route('**/api/foods/search*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FOOD) }));
  const add = await openAdd(page, 'Find food');
  await add.getByRole('searchbox').or(add.getByRole('combobox')).first().fill('spinach');
  await add.getByRole('button', { name: /Spinach/ }).first().click();
  await add.getByLabel('Grams').fill('100');
  await add.getByRole('button', { name: 'Use', exact: true }).click();
  await add.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  await openDayTotals(col);
  await expect(dialog(page).locator('#stt-zinc .stt-target')).toHaveText('Target: Meets the recommended amount'); // 5 + 5 = 10 mg, within 8 to 11
  await expect(dialog(page).locator('#stt-zinc')).toContainText('25% of the limit'); // 10 of 40 mg: the limit line is its own
});
