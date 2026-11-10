import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSupplementEditor, openNutrition, openSupplementEditor, todayCol } from './nutritionBoardHelpers.js';

// Brief supplement-nutrient-totals, PR 2: what is in a supplement (typed on its sheet), the Totals sheet, and the warning line under a day's ticks. The sums, limits and words are node tests
// (supplementNutrients.test.ts, supplementTotalsView.test.ts); this covers the wiring a node test cannot: the form rows, the sheet, the link, the warning, phone width and axe. The fixed clock is Thursday 2026-09-24.
const dialog = page => page.getByRole('dialog');
// Open to everyone since 2026-11-09 (the `supplementTotals` flag is gone); most tests here still sign in as an admin from habit, and the last one runs without.
const asAdmin = async page => { await page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true')); await page.reload(); };

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
  await expect(page.locator('#sched-h')).toBeVisible(); // back in the editor it was opened from
}

async function setUp(page) {
  await openNutrition(page);
  await openSupplementEditor(page);
  await addSupplement(page, 'Mag A', [['Magnesium', 200, 'mg']]);
  await addSupplement(page, 'Mag B', [['Magnesium', 200, 'mg'], ['Vitamin D', 4000, 'IU']]);
  await closeSupplementEditor(page);
}

test('a day with no nutrient data has a Totals sheet that says what to do and no warning', async ({ page }) => {
  await asAdmin(page);
  await openNutrition(page);
  await openSupplementEditor(page);
  await page.locator('#suplib-add').click(); await page.locator('#suppadd-full').click();
  await page.locator('#supp-name').fill('Plain');
  await page.getByRole('button', { name: 'Save' }).click();
  await closeSupplementEditor(page);
  const col = todayCol(page);
  await expect(col.locator('.nb-suppwarn')).toHaveCount(0);
  await col.getByRole('button', { name: 'Totals' }).click();
  await expect(dialog(page)).toContainText('Add what is in a supplement, or log a food with a barcode scan or Find food, to see totals.');
  await dialog(page).getByRole('button', { name: 'Add to Plain' }).click();
  await expect(page.locator('#supp-add-nutrient')).toBeVisible(); // the item's own sheet, with the nutrient rows
});

test('ticking supplements adds up what is in them, warns past the limit and the sheet says so in words', async ({ page }) => {
  await asAdmin(page);
  await setUp(page);
  const col = todayCol(page);
  await col.getByLabel('Mag A', { exact: false }).first().check();
  await expect(col.locator('.nb-suppwarn')).toHaveCount(0); // 200 mg of 350
  await col.getByRole('button', { name: 'Totals' }).click();
  const s = dialog(page);
  await expect(s.locator('#stt-magnesium')).toContainText('200 mg');
  await expect(s.locator('#stt-magnesium')).toContainText('57% of the limit');
  await s.getByRole('button', { name: 'Everything scheduled' }).click();
  await expect(s.locator('#stt-magnesium')).toContainText('400 mg');
  await expect(s.locator('#stt-magnesium')).toContainText('Over the limit by 50 mg');
  await expect(s.locator('#stt-magnesium')).toContainText('Mag B 200 mg');
  await expect(s.locator('#stt-vitaminD')).toContainText('100 mcg'); // 4,000 IU at 40 IU per mcg
  await expect(s).toContainText('Food counts only where the foods you logged list vitamins or minerals');
  await expect(s).toContainText('not medical advice');
  await s.getByRole('button', { name: 'Done' }).click();
  await col.getByLabel('Mag B', { exact: false }).first().check();
  await expect(col.locator('.nb-suppwarn')).toHaveText('Over an upper limit today: Magnesium. Totals shows what each limit counts. General information, not medical advice.');
});

test('Totals sheet has no axe violations (light and dark) and does not scroll sideways at 375 px', async ({ page }) => {
  await asAdmin(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await setUp(page);
  await todayCol(page).getByLabel('Mag B', { exact: false }).first().check();
  await todayCol(page).getByRole('button', { name: 'Totals' }).click();
  await dialog(page).getByRole('button', { name: 'Everything scheduled' }).click(); // 400 mg of magnesium: the over-the-limit row is the one with the strongest colour
  await expect(dialog(page).locator('#stt-magnesium')).toContainText('Over the limit by 50 mg');
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.emulateMedia({ colorScheme: 'dark' }); // the over-limit rust and the close-to-limit text pass contrast in the dark theme too
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
  await dialog(page).getByRole('button', { name: 'Done' }).click();
});

test('removing every nutrient row clears what the item lists', async ({ page }) => {
  await asAdmin(page);
  await setUp(page);
  await openSupplementEditor(page);
  await page.getByRole('button', { name: /^Edit Mag A/ }).click();
  await page.getByRole('button', { name: 'Remove Magnesium row' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await closeSupplementEditor(page);
  await todayCol(page).getByLabel('Mag A', { exact: false }).first().check();
  await todayCol(page).getByRole('button', { name: 'Totals' }).click();
  await expect(dialog(page).locator('#stt-magnesium')).toHaveCount(0);
});

test('a person who is not an admin sees the nutrient rows, the Totals button and the warning like everyone (released 2026-11-09)', async ({ page }) => {
  await setUp(page); // no admin session
  await openNutrition(page);
  const col = todayCol(page);
  await col.getByLabel('Mag A', { exact: false }).first().check();
  await col.getByLabel('Mag B', { exact: false }).first().check(); // 400 mg of magnesium: over the limit
  await expect(col.locator('.nb-suppwarn')).toContainText('Over an upper limit today: Magnesium');
  await expect(col.getByRole('button', { name: /^Totals/ })).toBeVisible();
  await openSupplementEditor(page);
  await page.getByRole('button', { name: /^Edit Mag A/ }).click();
  await expect(page.locator('#supp-add-nutrient')).toBeVisible();
});
