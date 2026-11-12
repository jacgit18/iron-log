import { test, expect } from './fixtures.js';
import { closeSheet, openDrink, openManage, openNutrition, openTargets } from './nutritionBoardHelpers.js';

// Ownership leftovers 4b: one id per control. The water goal's inline editor owns #water-goal-edit; no other control on the Nutrition board, in any sheet or state, reuses it.
const editors = page => page.locator('#water-goal-edit').count();

test('#water-goal-edit is never on the page more than once, in the board, the drink sheet, Manage or Targets', async ({ page }) => {
  await openNutrition(page);
  expect(await editors(page)).toBeLessThanOrEqual(1);
  await openDrink(page, '2026-09-24');
  expect(await editors(page)).toBeLessThanOrEqual(1);
  await closeSheet(page);
  await openManage(page);
  expect(await editors(page)).toBeLessThanOrEqual(1);
  await closeSheet(page);
  const targets = await openTargets(page);
  expect(await editors(page)).toBe(1); // the inline editor's button, once
  await targets.locator('#water-goal-edit').click();
  expect(await editors(page)).toBeLessThanOrEqual(1);
});
