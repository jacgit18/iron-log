import { expect } from '@playwright/test';

// Shared steps for specs that use the Nutrition board (brief nutrition-board). The board replaced the Diet, Supplements, Water and Last 7 days panels; food is added from the add sheet, water from the drink sheet.
export const openNutrition = async page => {
  await page.click('#tab-daily');
  await page.click('#daily-supplements');
  await expect(page.locator('#nb-h')).toBeVisible();
};
// The add sheet for the board's selected day (today unless a day was picked); `flow` is a way of adding by its name ("One-off food", "Find food", "Quick add", "Saved meals", "Recipes", "Copy yesterday", "Save as a meal"). Returns the dialog.
export const openAdd = async (page, flow) => {
  await page.locator('#nb-add').click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  if (flow) await sheet.getByRole('button', { name: new RegExp(`^${flow}`) }).click();
  return sheet;
};
export const closeSheet = async page => { await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); };
// The drink sheet of a day column (a short name such as "Sun 20", or the day's `data-day` date such as 2026-09-24).
export const openDrink = async (page, day) => {
  await page.locator(`.nb-col[data-day="${day}"]`).getByRole('button', { name: /^\+ Drink/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  return sheet;
};
// Today's column on the board (the fixed clock in fixtures.js is Thursday 2026-09-24).
export const todayCol = page => page.locator('.nb-col.today');
// The Targets and goal sheet (PR 2 of brief nutrition-board) and the Manage sheet, opened from the board header. Both return the dialog.
export const openTargets = async page => {
  await page.locator('#nb-targets').click();
  const sheet = page.getByRole('dialog', { name: 'Targets and goal' });
  await expect(sheet).toBeVisible();
  return sheet;
};
export const openManage = async page => {
  await page.locator('#nb-manage').click();
  const sheet = page.getByRole('dialog', { name: 'Manage' });
  await expect(sheet).toBeVisible();
  return sheet;
};
// The supplement editor and library: Manage, then Supplements and library. `closeSupplementEditor` is its Done button.
export const openSupplementEditor = async page => { await openManage(page); await page.locator('#sched-edit').click(); await expect(page.locator('#sched-h')).toBeVisible(); };
export const closeSupplementEditor = async page => { await page.locator('#sched-done').click(); await expect(page.getByRole('dialog')).toHaveCount(0); };
