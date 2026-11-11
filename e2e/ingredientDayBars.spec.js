import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSupplementEditor, openNutrition, openSupplementEditor, todayCol } from './nutritionBoardHelpers.js';

// Brief ingredient-day-bars (layout A): the line under a day's Supplements for the ingredient limits you set. Which ingredients appear, the percentages and the words are node tests
// (dayIngredientMeter.test.ts); this covers the wiring: the line on the Board, the tap that opens the bars, Open Totals, a day with nothing ticked, axe at 375 px. The fixed clock is Thursday 2026-09-24.
const dialog = page => page.getByRole('dialog');
const line = col => col.locator('.nb-vit[id^=nb-ing-]');

async function addFishOil(page) {
  await page.locator('#suplib-add').click(); await page.locator('#suppadd-full').click();
  await page.locator('#supp-name').fill('Fish oil');
  await page.locator('#supp-add-ingredient').click();
  await page.getByLabel('Ingredient 1', { exact: true }).selectOption('Omega-3'); await page.getByLabel('Amount of ingredient 1').fill('475');
  await page.locator('#supp-add-ingredient').click();
  await page.getByLabel('Ingredient 2', { exact: true }).selectOption('EPA'); await page.getByLabel('Amount of ingredient 2').fill('175');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#sched-h')).toBeVisible();
}
const setLimit = async (page, name, kind, amount) => {
  await dialog(page).getByRole('button', { name: `Set your limit for ${name}` }).click();
  await dialog(page).locator(`#ilim-${kind}`).click(); await dialog(page).locator('#ilim-amount').fill(String(amount)); await dialog(page).locator('#ilim-save').click();
};
async function setUp(page, cap, epaTarget) {
  await openNutrition(page); await openSupplementEditor(page); await addFishOil(page); await closeSupplementEditor(page);
  const col = todayCol(page);
  await col.getByLabel('Fish oil', { exact: false }).first().check();
  if (cap) {
    await col.getByRole('button', { name: 'Totals' }).click();
    await setLimit(page, 'Omega-3', 'cap', cap);
    if (epaTarget) await setLimit(page, 'EPA', 'target', epaTarget);
    await dialog(page).getByRole('button', { name: 'Done' }).click();
  }
  return col;
}

test('no line without a limit; with a cap the closed line names it and a tap opens its bar', async ({ page }) => {
  const col = await setUp(page);
  await expect(line(col)).toHaveCount(0); // an ingredient with no limit has no bar here
  await expect(page.locator('.nb-col[data-day="2026-09-23"]').getByText('Active ingredients')).toHaveCount(0); // an earlier day with nothing ticked and no limits has no line
  await col.getByRole('button', { name: 'Totals' }).click();
  await dialog(page).getByRole('button', { name: 'Set your limit for Omega-3' }).click();
  await dialog(page).locator('#ilim-cap').click(); await dialog(page).locator('#ilim-amount').fill('1000'); await dialog(page).locator('#ilim-save').click();
  await dialog(page).getByRole('button', { name: 'Done' }).click();
  await expect(line(col)).toContainText('Active ingredients: Omega-3 48%'); // 475 mg of 1,000
  const tog = line(col).getByRole('button', { name: /Active ingredients/ });
  await expect(tog).toHaveAttribute('aria-expanded', 'false');
  await tog.click();
  await expect(tog).toHaveAttribute('aria-expanded', 'true');
  await expect(line(col).getByRole('img', { name: /Omega-3: 475 mg\. 48% of your cap\. Your cap: 1,000 mg a day/ })).toBeVisible();
  await line(col).getByRole('button', { name: 'Open Totals' }).click();
  await expect(dialog(page).locator('#stt-ing-omega-3')).toContainText('48% of your cap'); // the same figure as the sheet
});

test('a cap passed reads over in words, and an untick says nothing ticked yet', async ({ page }) => {
  const col = await setUp(page, 400, 175);
  await expect(line(col)).toContainText('Active ingredients: Omega-3 over · EPA Met'); // the two nearest their limits
  await line(col).getByRole('button', { name: /Active ingredients/ }).click();
  await expect(line(col).getByRole('img', { name: /Over your cap by 75 mg/ })).toBeVisible();
  await expect(line(col).locator('.nb-vit-sub')).toHaveCount(2); // a thin bar for each limited ingredient
  await col.getByLabel('Fish oil', { exact: false }).first().uncheck();
  await expect(line(col)).toHaveCount(0);
  await expect(col.getByText('Active ingredients: nothing ticked yet')).toBeVisible();
  await expect(page.locator('.nb-col[data-day="2026-09-23"]').getByText('Active ingredients: nothing ticked yet')).toBeVisible(); // limits are yours for every day, so an earlier day with no ticks reads the same
});

test('the line has no axe violations (light and dark) and does not scroll sideways at 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const col = await setUp(page, 400);
  await line(col).getByRole('button', { name: /Active ingredients/ }).click();
  const axe = () => new AxeBuilder({ page }).include('.nb-vit[id^=nb-ing-]').analyze();
  expect((await axe()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect((await axe()).violations).toEqual([]);
  await col.getByLabel('Fish oil', { exact: false }).first().uncheck(); // the nothing-ticked line on a phone
  await expect(col.getByText('Active ingredients: nothing ticked yet')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
