import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSupplementEditor, openNutrition, openSupplementEditor, todayCol } from './nutritionBoardHelpers.js';

// Brief supplement-more-nutrients, PR 2: the grouped pickers and the Totals sheet rows for the eight added nutrients. The figures, limits and words are node tests (supplementTotalsView.test.ts and the three
// table tests); this covers the wiring: picking the new nutrients by heading, a limit nutrient (manganese) and a target nutrient (thiamin) in the sheet, no warning for the target, axe at 375 px in both
// themes and no sideways scroll. The fixed clock is Thursday 2026-09-24.
const dialog = page => page.getByRole('dialog');

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
async function setUp(page) {
  await openNutrition(page);
  await openSupplementEditor(page);
  await addSupplement(page, 'B and trace', [['Thiamin (vitamin B1)', 12, 'mg'], ['Manganese', 15, 'mg'], ['Biotin', 300, 'mcg']]);
  await closeSupplementEditor(page);
  await todayCol(page).getByLabel('B and trace', { exact: false }).first().check();
}

test('the picker lists the eight added nutrients under their headings and a unit follows the nutrient', async ({ page }) => {
  await openNutrition(page);
  await openSupplementEditor(page);
  await page.locator('#suplib-add').click(); await page.locator('#suppadd-full').click();
  await page.locator('#supp-add-nutrient').click();
  const groups = await page.getByLabel('Nutrient 1').locator('optgroup').evaluateAll(gs => gs.map(g => ({ heading: g.label, names: [...g.querySelectorAll('option')].map(o => o.textContent) })));
  const byHeading = Object.fromEntries(groups.map(g => [g.heading, g.names]));
  expect(byHeading.Vitamins).toEqual(expect.arrayContaining(['Thiamin (vitamin B1)', 'Riboflavin (vitamin B2)', 'Biotin', 'Pantothenic acid (vitamin B5)']));
  expect(byHeading.Minerals).toEqual(expect.arrayContaining(['Chromium', 'Manganese', 'Molybdenum']));
  expect(byHeading.Other).toContain('Choline');
  await page.getByLabel('Nutrient 1').selectOption({ label: 'Biotin' });
  await expect(page.getByLabel('Unit 1')).toHaveValue('mcg');
  await page.getByLabel('Nutrient 1').selectOption({ label: 'Choline' });
  await expect(page.getByLabel('Unit 1')).toHaveValue('mg');
});

test('the Totals sheet shows manganese with its limit and thiamin and biotin under No upper limit, and only manganese warns', async ({ page }) => {
  await setUp(page);
  const col = todayCol(page);
  await expect(col.locator('.nb-suppwarn')).toContainText('Manganese'); // 15 mg of 11
  await expect(col.locator('.nb-suppwarn')).not.toContainText(/Thiamin|Biotin/);
  await col.getByRole('button', { name: /^Totals for/ }).click();
  const s = dialog(page);
  await expect(s.locator('#stt-manganese')).toContainText('Over the limit by 4 mg');
  await expect(s.getByRole('heading', { name: 'No upper limit' })).toBeVisible();
  await expect(s.locator('#stt-thiamin')).toContainText('12 mg');
  await expect(s.locator('#stt-thiamin')).toContainText('Above the recommended range');
  await expect(s.locator('#stt-biotin')).toContainText('300 mcg');
  await expect(s.locator('#stt-targets .stt-row.over, #stt-targets .stt-row.close')).toHaveCount(0);
});

test('the sheet with the new rows has no axe violations in either theme at 375 px and does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await setUp(page);
  await todayCol(page).getByRole('button', { name: /^Totals for/ }).click();
  await expect(dialog(page).locator('#stt-manganese')).toBeVisible();
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
});
