import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSupplementEditor, openNutrition, openSupplementEditor, todayCol, openDayTotals } from './nutritionBoardHelpers.js';

// Brief supplement-active-ingredients, PR 1: ingredient rows on a supplement, the Active ingredients section of the Totals sheet, your own limit and the not-medical-advice note. The sums, units and words are node tests
// (supplementIngredients.test.ts); this covers the wiring a node test cannot: the form rows, the sheet, the history entry, a reload and axe. The fixed clock is Thursday 2026-09-24.
const dialog = page => page.getByRole('dialog');

async function addFishOil(page) {
  await page.locator('#suplib-add').click(); await page.locator('#suppadd-full').click();
  await page.locator('#supp-name').fill('Fish oil');
  await page.locator('#supp-add-ingredient').click();
  await page.getByLabel('Ingredient 1', { exact: true }).selectOption('Omega-3'); await page.getByLabel('Amount of ingredient 1').fill('475');
  await page.locator('#supp-add-ingredient').click();
  await page.getByLabel('Ingredient 2', { exact: true }).selectOption('EPA'); await page.getByLabel('Amount of ingredient 2').fill('175');
  await page.locator('#supp-add-ingredient').click();
  await page.getByLabel('Ingredient 3', { exact: true }).selectOption({ label: 'Other ingredient…' });
  await page.getByLabel('Name of ingredient 3').fill('  l-theanine ');
  await page.getByLabel('Amount of ingredient 3').fill('200');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#sched-h')).toBeVisible();
}
const setUp = async page => { await openNutrition(page); await openSupplementEditor(page); await addFishOil(page); await closeSupplementEditor(page); };
const openTotals = async page => { await openDayTotals(todayCol(page)); return dialog(page); };

test('ingredient rows save, add up on the Totals sheet with the note, and a typed name that matches a curated one merges', async ({ page }) => {
  await setUp(page);
  await todayCol(page).getByLabel('Fish oil', { exact: false }).first().check();
  const s = await openTotals(page);
  await expect(s.locator('#stt-ingredients')).toBeVisible();
  await expect(s.locator('#stt-ing-omega-3')).toContainText('475 mg');
  await expect(s.locator('#stt-ing-epa')).toContainText('175 mg');
  await expect(s.locator('#stt-ing-l-theanine')).toContainText('200 mg');
  await expect(s.locator('#stt-ing-omega-3')).toContainText('Fish oil 475 mg');
  await expect(s.locator('#stt-ing-omega-3')).not.toContainText('of your'); // no limit: the figure and the link only
  await expect(s.locator('#stt-limit-omega-3')).toHaveText('Set your limit');
  await expect(s.locator('#stt-ing-note')).toContainText('not a recommendation or medical advice');
  await s.getByRole('button', { name: 'Done' }).click();
  // a second product adds to the same ingredient, typed in another case
  await openSupplementEditor(page);
  await page.locator('#suplib-add').click(); await page.locator('#suppadd-full').click();
  await page.locator('#supp-name').fill('Cod liver');
  await page.locator('#supp-add-ingredient').click();
  await page.getByLabel('Ingredient 1', { exact: true }).selectOption({ label: 'Other ingredient…' });
  await page.getByLabel('Name of ingredient 1').fill('OMEGA-3'); await page.getByLabel('Amount of ingredient 1').fill('0.5'); await page.getByLabel('Unit of ingredient 1').selectOption('g');
  await page.getByRole('button', { name: 'Save' }).click();
  await closeSupplementEditor(page);
  const u = await openTotals(page); // scheduled but unticked: on Everything scheduled it shows its figure with Set your limit
  await u.getByRole('button', { name: 'Everything scheduled' }).click();
  await expect(u.locator('#stt-ing-omega-3')).toContainText('Cod liver 500 mg');
  await expect(u.locator('#stt-limit-omega-3')).toHaveText('Set your limit');
  await u.getByRole('button', { name: 'Done' }).click();
  await todayCol(page).getByLabel('Cod liver', { exact: false }).first().check();
  const t = await openTotals(page);
  await expect(t.locator('#stt-ing-omega-3')).toContainText('975 mg');
  await expect(t.locator('#stt-ing-omega-3')).toContainText('Cod liver 500 mg');
});

test('the editor has the not-medical-advice note and the Supplement Facts note', async ({ page }) => {
  await openNutrition(page); await openSupplementEditor(page);
  await page.locator('#suplib-add').click(); await page.locator('#suppadd-full').click();
  await expect(page.locator('#supp-ingredient-note')).toContainText('not a recommendation or medical advice');
  await expect(page.locator('#supp-panel-note')).toContainText('Amount Per Serving');
  await expect(page.locator('select[aria-label^="Ingredient "]')).toHaveCount(0); // no ingredient rows until one is added
  await page.locator('#supp-add-nutrient').click();
  await expect(page.getByLabel('Nutrient 1').locator('option')).toHaveCount(28); // the nutrient picker offers all 28, grouped
  await expect(page.getByLabel('Nutrient 1').locator('optgroup')).toHaveCount(3);
  await page.getByRole('button', { name: /^Remove .* row$/ }).first().click();
  await page.locator('#supp-name').fill('Multivitamin'); // a supplement with no ingredient rows saves as it always did
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#sched-h')).toBeVisible();
  await page.getByRole('button', { name: 'Edit Multivitamin' }).click();
  await expect(page.locator('select[aria-label^="Ingredient "]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#sched-h')).toBeVisible();
});

test('Set your limit saves a cap, shows the bar in words, survives a reload, changes and removes, and Back closes the sheet', async ({ page }) => {
  await setUp(page);
  await todayCol(page).getByLabel('Fish oil', { exact: false }).first().check();
  let s = await openTotals(page);
  await s.getByRole('button', { name: 'Set your limit for Omega-3' }).click();
  const lim = dialog(page);
  await expect(lim).toContainText('Your limit for Omega-3');
  await expect(lim.locator('#ilim-note')).toContainText('not a recommendation or medical advice');
  await lim.locator('#ilim-cap').click();
  await lim.locator('#ilim-amount').fill('0'); await lim.locator('#ilim-save').click(); // refused
  await expect(lim.getByRole('alert')).toContainText('above zero');
  await lim.locator('#ilim-amount').fill('-5'); await lim.locator('#ilim-save').click(); // a negative amount is refused too
  await expect(lim.getByRole('alert')).toContainText('above zero');
  await lim.locator('#ilim-amount').fill('20000000'); await lim.locator('#ilim-save').click(); // and an oversized one
  await expect(lim.getByRole('alert')).toContainText('too large');
  await lim.locator('#ilim-amount').fill('1000'); await lim.locator('#ilim-save').click();
  s = dialog(page);
  await expect(s.locator('#stt-ing-omega-3')).toContainText('48% of your cap');
  await expect(s.locator('#stt-ing-omega-3')).toContainText('Your cap: 1,000 mg a day'); // 475 mg of 1,000
  await s.getByRole('button', { name: 'Done' }).click();
  await page.reload(); await openNutrition(page);
  s = await openTotals(page);
  await s.getByRole('button', { name: 'Everything scheduled' }).click();
  await expect(s.locator('#stt-ing-omega-3')).toContainText('Your cap: 1,000 mg a day'); // kept after a reload
  // change to a target
  await s.getByRole('button', { name: 'Change limit for Omega-3' }).click();
  await dialog(page).locator('#ilim-target').click(); await dialog(page).locator('#ilim-amount').fill('475'); await dialog(page).locator('#ilim-save').click();
  await expect(dialog(page).locator('#stt-ing-omega-3')).toContainText('Target met');
  // Back closes the sheet and stays in the app
  await dialog(page).getByRole('button', { name: 'Change limit for Omega-3' }).click();
  await expect(dialog(page)).toContainText('Your limit for Omega-3');
  await page.goBack();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('#nb-h')).toBeVisible();
  // remove: the ingredient is still listed, with the link again
  s = await openTotals(page);
  await s.getByRole('button', { name: 'Change limit for Omega-3' }).click();
  await dialog(page).locator('#ilim-remove').click();
  await expect(dialog(page).locator('#stt-limit-omega-3')).toHaveText('Set your limit');
});

test('a cap passed shows the over-cap line under the day and the row says so in words', async ({ page }) => {
  await setUp(page);
  const col = todayCol(page);
  await col.getByLabel('Fish oil', { exact: false }).first().check();
  let s = await openTotals(page);
  await s.getByRole('button', { name: 'Set your limit for Omega-3' }).click();
  await dialog(page).locator('#ilim-cap').click(); await dialog(page).locator('#ilim-amount').fill('400'); await dialog(page).locator('#ilim-save').click();
  await expect(dialog(page).locator('#stt-ing-omega-3')).toContainText('Over your cap by 75 mg');
  await expect(dialog(page).locator('#stt-ing-omega-3 .stt-bar')).toBeVisible(); // the bar and the words together: colour is never the only signal
  await expect(dialog(page).locator('#stt-ing-omega-3 .stt-st b')).toHaveText(/over/i);
  await dialog(page).getByRole('button', { name: 'Done' }).click();
  await expect(col.locator('[id^=nb-supp-capwarn]')).toContainText('Over your own cap today: Omega-3');
});

test('the Totals sheet and the limit sheet have no axe violations (light and dark) and do not scroll sideways at 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await setUp(page);
  await todayCol(page).getByLabel('Fish oil', { exact: false }).first().check();
  let s = await openTotals(page);
  await s.getByRole('button', { name: 'Set your limit for Omega-3' }).click();
  await dialog(page).locator('#ilim-cap').click(); await dialog(page).locator('#ilim-amount').fill('400'); await dialog(page).locator('#ilim-save').click();
  await expect(dialog(page).locator('#stt-ing-omega-3')).toContainText('Over your cap by 75 mg'); // the over-cap row is the strongest colour
  const axe = () => new AxeBuilder({ page }).include('[role=dialog]').analyze();
  expect((await axe()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect((await axe()).violations).toEqual([]);
  await dialog(page).getByRole('button', { name: 'Change limit for Omega-3' }).click();
  expect((await axe()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1920, height: 1080 });
  expect((await axe()).violations).toEqual([]);
});
