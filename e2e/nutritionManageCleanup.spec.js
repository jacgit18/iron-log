import { test, expect } from './fixtures.js';
import { openDayTotals, openManage, openNutrition, openTargets, todayCol } from './nutritionBoardHelpers.js';

// Brief nutrition-manage-cleanup: the Add supplement picker loses its Manage button, the day's Add supplement button reads "Also took", the Supplements section's Totals button hides while the vitamin meter draws its rows
// (the rule is a node test: lib/dayNutrientMeter.test.ts), and the Water reminder moved from Manage to Targets and goal. The fixed clock is Thursday 2026-09-24.
const day = '2026-09-24';
const D = { id: 'd', n: 'D cap', slot: 'morning', nutrients: [{ key: 'vitaminD', amount: 112, unit: 'mcg' }] };
const seed = async (page, items, taken = {}) => {
  await page.evaluate(([l, t]) => localStorage.setItem('ironlog:supplements/main', JSON.stringify({ waterGoal: 64, waterMode: 'weight', water: {}, boost: {}, taken: t, items: l })), [items, taken]);
  await page.reload();
  await openNutrition(page);
};
const totalsBtn = page => todayCol(page).locator(`#nb-supp-totals-${day}`);

test('the day button reads Also took, and its picker has no Manage button', async ({ page }) => {
  await seed(page, [{ id: 'magnesium', n: 'Magnesium', slot: '', dose: '400 mg' }]);
  const btn = todayCol(page).locator(`#nb-supp-add-${day}`);
  await expect(btn).toHaveText('Also took');
  await expect(btn).toHaveAccessibleName('Also took a supplement on Thu 24');
  await btn.click();
  const sheet = page.getByRole('dialog', { name: /^Also took/ });
  await expect(sheet.getByRole('heading', { name: 'Also took · Thu 24' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: '+ New supplement' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Done' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Manage' })).toHaveCount(0);
});

test('Totals shows once: the section button hides while the vitamin meter draws rows, and the meter reaches the sheet', async ({ page }) => {
  await seed(page, [D], { [day]: { d: true } });
  const col = todayCol(page);
  await expect(col.locator('.nb-vit-tog')).toBeVisible();
  await expect(totalsBtn(page)).toHaveCount(0);
  await openDayTotals(col);
  await expect(page.getByRole('dialog')).toContainText('Vitamin D');
});

test('Totals stays where the meter has no way in: nothing ticked yet, and a day with no nutrient data', async ({ page }) => {
  await seed(page, [D]);
  await expect(todayCol(page).locator(`#nb-vit-${day}`)).toContainText('nothing ticked yet');
  await expect(totalsBtn(page)).toBeVisible();
  await seed(page, [{ id: 'x', n: 'Plain', slot: 'morning' }], { [day]: { x: true } });
  await expect(todayCol(page).locator('.nb-vit-tog')).toHaveCount(0);
  await expect(totalsBtn(page)).toBeVisible();
  await openDayTotals(todayCol(page));
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('Water reminder is in Targets and goal and opens Settings at Alerts; Manage no longer has it', async ({ page }) => {
  await openNutrition(page);
  const m = await openManage(page);
  await expect(m.getByRole('button', { name: 'Supplements and library' })).toBeVisible();
  await expect(m.getByRole('button', { name: 'Meals and foods (opens Recipes)' })).toBeVisible();
  await expect(m.locator('#nb-manage-water')).toHaveCount(0);
  await m.getByRole('button', { name: 'Done' }).click();
  const t = await openTargets(page);
  await expect(t.locator('#water-goal-edit')).toBeVisible();
  await t.locator('#nb-manage-water').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('settings');
});
