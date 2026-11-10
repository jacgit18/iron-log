import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSheet, closeSupplementEditor, openAdd, openNutrition, openSupplementEditor, todayCol } from './nutritionBoardHelpers.js';

// Brief supplement-more-nutrients, PR 2: the grouped pickers and the Totals sheet rows for the eight added nutrients. The figures, limits and words are node tests (supplementTotalsView.test.ts and the three
// table tests); this covers the wiring: picking the new nutrients by heading, a limit nutrient (manganese) and a target nutrient (thiamin) in the sheet, no warning for the target, axe at 375 px in both
// themes and no sideways scroll. The fixed clock is Thursday 2026-09-24.
const dialog = page => page.getByRole('dialog');
const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const EIGHT = [['thiamin', 1.2], ['riboflavin', 1.3], ['biotin', 30], ['pantothenicAcid', 5], ['choline', 100], ['chromium', 35], ['molybdenum', 45], ['manganese', 2]];

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

test('a label import brings in the eight added nutrients as rows', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:session/known', 'true'); });
  await page.route('**/api/sync*', json(200, { rows: [], cursor: '1', more: false }));
  await page.route('**/api/me', json(200, { ok: true, userId: 'dev-user', account: { kind: 'dev', email: null, name: null } }));
  await page.route('**/api/commands/**', json(200, { rows: [], cursor: '2' }));
  await page.route('**/api/catalog?*', json(200, { ok: true, items: [] }));
  await page.route('**/api/catalog/search?*', json(200, { ok: true, items: [{ id: 'c:dsld:900', name: 'Full Blend', brand: 'Acme', data: { form: 'Tablet', entryYear: 2020, upc: '031604026505' } }], more: false }));
  await page.route('**/api/supplement-label/*', json(200, { label: { name: 'Full Blend', brand: 'Acme', entryYear: 2020, serving: { text: '1 tablet', units: 1, form: 'tablet' }, rows: EIGHT.map(([key, amount]) => ({ key, amount, unit: ['biotin', 'chromium', 'molybdenum'].includes(key) ? 'mcg' : 'mg' })), other: [] } }));
  await page.goto('/');
  await page.click('#tab-daily'); await page.click('#daily-supplements');
  await openSupplementEditor(page);
  await page.locator('#suplib-add').click();
  const sheet = page.getByRole('dialog', { name: 'Add a supplement' });
  await sheet.locator('#suppadd-q').fill('full blend');
  await sheet.getByRole('button', { name: /2020 label/ }).click();
  await expect(sheet.locator('.lblrows')).toContainText('Thiamin');
  await expect(sheet.locator('.lblrows')).toContainText('Manganese');
  await sheet.getByLabel('Morning').check();
  await page.click('#suppadd-go');
  await expect(sheet).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Full Blend' }).click();
  await expect(page.locator('.nrow')).toHaveCount(8);
  await expect(page.getByLabel('Nutrient 1')).toHaveValue(/./);
  const keys = await page.locator('.nrow select[aria-label^="Nutrient"]').evaluateAll(els => els.map(e => e.value));
  expect(keys.sort()).toEqual(EIGHT.map(([k]) => k).sort());
});

test('a looked-up food carries the eight added nutrients into the Totals sheet', async ({ page }) => {
  const micro = Object.fromEntries(EIGHT.map(([k, v]) => [k, v]));
  await page.route('**/api/foods/search*', json(200, { ok: true, hits: [{ id: 7, name: 'Mixed greens', kcal: 100, p: 10, c: 5, f: 1, micro }] }));
  await openNutrition(page);
  const sheet = await openAdd(page, 'Find food');
  await sheet.getByRole('searchbox').or(sheet.getByRole('combobox')).first().fill('greens');
  await sheet.getByRole('button', { name: /Mixed greens/ }).first().click();
  await sheet.getByLabel('Grams').fill('100');
  await sheet.getByRole('button', { name: 'Use', exact: true }).click();
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  await todayCol(page).getByRole('button', { name: /^Totals for/ }).click();
  const s = dialog(page);
  for (const k of ['thiamin', 'riboflavin', 'biotin', 'pantothenicAcid', 'choline', 'chromium', 'molybdenum', 'manganese']) await expect(s.locator(`#stt-${k}`)).toBeVisible();
});
