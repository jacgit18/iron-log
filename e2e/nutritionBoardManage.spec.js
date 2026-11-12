import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, openDrink, openManage, openNutrition } from './nutritionBoardHelpers.js';

// PR 2 of brief nutrition-board, then brief targets-into-manage: the Manage sheet (daily targets, read-only weight and goal, water, library), opened from the board's header. The numbers behind them are node tests (dietTarget.test.ts, water.test.ts);
// this covers the wiring: the sheet opens and closes, a saved number shows where it is used, the old Targets panel, the Targets and goal sheet and the on-page editor are gone, and Manage reaches the other screens. The fixed clock is Thursday 2026-09-24.
const sheet = page => page.getByRole('dialog');

test('Manage holds the targets and the water base, shows weight and goal read-only, and saved numbers survive a reload', async ({ page }) => {
  await openNutrition(page);
  await expect(page.locator('#diet-h')).toHaveCount(0); // no Diet panel under the board
  const s = await openManage(page);
  await expect(s.locator('#nb-manage-weight')).toContainText('No weigh-in yet');
  await expect(s.locator('#nb-manage-goal')).toContainText('No goal set');
  await expect(s.locator('#nbt-weight, #nbt-goal, #nbt-goal-by')).toHaveCount(0); // no weight or goal form: weight is typed on the Board, the goal in Progress
  await s.getByRole('button', { name: 'Set target' }).click();
  await page.locator('#dt-tk').fill('2600');
  await page.locator('#dt-tp').fill('170');
  await s.getByRole('button', { name: 'Save target' }).click();
  await expect(s).toContainText('2,600 kcal');
  await s.locator('#water-goal-edit').click();
  await s.getByLabel('Fixed daily goal (oz)').fill('100');
  await s.getByRole('button', { name: 'Use this amount' }).click();
  await expect(s).toContainText('100 oz');
  await s.getByRole('button', { name: 'Done' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await page.reload();
  await openNutrition(page);
  const again = await openManage(page);
  await expect(again).toContainText('2,600 kcal');
  await expect(again).toContainText('100 oz');
});

test('Manage shows the latest weigh-in and the goal from the data, and "Edit in Progress" opens Progress > Trends', async ({ page }) => {
  await openNutrition(page);
  await page.evaluate(() => {
    localStorage.setItem('ironlog:config/main', JSON.stringify({ bwGoal: { w: 190, by: '2027-03-01' } }));
    localStorage.setItem('ironlog:body/main', JSON.stringify({ schema: 1, entries: [{ wk: '2026-09-20', d: '2026-09-21', w: 180 }] }));
  });
  await page.reload();
  const m = await openManage(page);
  await expect(m.locator('#nb-manage-weight')).toContainText('Current weight: 180 lb');
  await expect(m.locator('#nb-manage-goal')).toContainText('Goal: 190 lb by');
  await expect(m.locator('#nb-manage-weight-edit')).toHaveText('Weigh in on the Board');
  await m.locator('#nb-manage-goal-edit').click();
  await expect(sheet(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('progress/trends');
});

test('the drink sheet sends the base goal to Manage, and the water base is there', async ({ page }) => {
  await openNutrition(page);
  await openDrink(page, '2026-09-24');
  await expect(sheet(page).getByLabel('Fixed daily goal (oz)')).toHaveCount(0); // the editor moved
  await expect(page.locator('#water-goal-edit')).toHaveCount(0); // the inline editor's id is not reused by this button
  await sheet(page).locator('#water-goal-targets').click();
  await expect(sheet(page).getByRole('heading', { name: 'Manage' })).toBeVisible();
  await expect(sheet(page).locator('#water-goal-edit')).toBeVisible();
  await expect(sheet(page).locator('#water-goal-edit')).toBeInViewport(); // Manage opens scrolled to Water, not at the top
});

test('Manage reaches the supplement editor, saved meals and foods, and the water reminder', async ({ page }) => {
  await openNutrition(page);
  const m = await openManage(page);
  await expect(m.getByRole('button', { name: 'Supplements and library' })).toBeVisible();
  await expect(m.getByRole('button', { name: 'Meals and foods (opens Recipes)' })).toBeVisible();
  await expect(m.getByRole('button', { name: 'Water reminder' })).toBeVisible();
  await expect(page.locator('#sched-h')).toHaveCount(0); // the editor is not on the page
});

test('Manage: Supplements and library has a way back, and Meals and foods (opens Recipes) opens Recipes with Back to Nutrition', async ({ page }) => {
  await openNutrition(page);
  await openManage(page);
  await page.locator('#sched-edit').click();
  await expect(page.locator('#suplib-h')).toBeVisible();
  await page.locator('#sched-back').click();
  await expect(sheet(page).getByRole('heading', { name: 'Manage' })).toBeVisible();
  await page.locator('#nb-manage-meals').click();
  await expect(sheet(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('daily/recipes');
  await page.goBack();
  await expect(page.locator('#nb-h')).toBeVisible();
});

test('Manage: Water reminder opens Settings', async ({ page }) => {
  await openNutrition(page);
  await openManage(page);
  await page.locator('#nb-manage-water').click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator('#tab-settings, #view').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('settings');
});

test('the Manage button is 44px tall on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openNutrition(page);
  await expect(page.locator('#nb-targets')).toHaveCount(0);
  expect((await page.locator('#nb-manage').boundingBox()).height).toBeGreaterThanOrEqual(44);
});

test('adding a supplement from the library in Manage returns to the editor with it listed', async ({ page }) => {
  await openNutrition(page);
  await openManage(page);
  await page.locator('#sched-edit').click();
  await page.locator('#suplib-add').click(); await page.locator('#suppadd-full').click();
  await page.fill('#supp-name', 'Vitamin D3');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#suplib-h')).toBeVisible(); // back in the editor, not on the board
  await expect(page.locator('.exlib .exrow b', { hasText: 'Vitamin D3' })).toBeVisible();
});

test('phone Back from a supplement opened in the library closes it, then Manage, then leaves Nutrition', async ({ page }) => {
  // Closing the supplement sheet puts the editor back (like Cancel), so Back is one step per sheet: no extra Manage appears after the sheet is gone.
  await openNutrition(page);
  await openManage(page);
  await page.locator('#sched-edit').click();
  await page.locator('#suplib-add').click(); await page.locator('#suppadd-full').click();
  await expect(page.locator('#supp-name')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#supp-name')).toHaveCount(0);
  await expect(page.locator('#suplib-h')).toBeVisible();
  await page.goBack();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator('#nb-h')).toBeVisible();
  await page.goBack();
  await expect.poll(() => page.evaluate(() => location.hash)).not.toContain('nutrition');
});

test('the Add food sheet (Find food included) is 640 px wide from 768 px; every other sheet keeps 480 px (brief nutrition-items-row-sheet-and-more)', async ({ page }) => {
  await openNutrition(page);
  const add = await openAdd(page);
  expect((await add.boundingBox()).width).toBeCloseTo(640, 0);
  await add.getByRole('button', { name: /^Find food/ }).click();
  expect((await page.getByRole('dialog').boundingBox()).width).toBeCloseTo(640, 0);
  await closeSheet(page);
  expect((await (await openManage(page)).boundingBox()).width).toBeLessThanOrEqual(480);
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await page.setViewportSize({ width: 600, height: 800 });
  await page.locator('#nb-add').click();
  expect((await page.getByRole('dialog').boundingBox()).width).toBeLessThanOrEqual(480); // below 768 px the Add food sheet is the normal width too
});
