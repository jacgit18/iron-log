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
// An eaten row opens a sheet (brief nutrition-items-row-sheet-and-more). `editEaten` opens it from today's row (or uses the sheet that is already open) and starts Edit; `deleteEaten` taps the sheet's two-tap Delete.
export const editEaten = async (page, name = '') => {
  const d = page.getByRole('dialog');
  if (!(await d.count())) await todayCol(page).locator('.nb-eatrow', { hasText: name }).first().click();
  await d.getByRole('button', { name: 'Edit', exact: true }).click();
};
export const deleteEaten = async (page, name) => {
  await todayCol(page).locator('.nb-eatrow', { hasText: name }).first().click();
  const del = page.getByRole('dialog').getByRole('button', { name: new RegExp(`Delete ${name}$`) });
  await del.click(); await del.click(); // two taps: arm, then confirm
  await expect(page.getByRole('dialog')).toHaveCount(0);
};
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
// The merged supplement list in Manage (brief supplement-merged-list): a product is one row, its times are the lit chips.
export const suppRow = (page, name) => page.locator('.exlib .exrow').filter({ hasText: name });
export const suppChip = (page, name, slot) => suppRow(page, name).getByRole('button', { name: slot, exact: true });
// Each text is a name, optionally followed by its dose ("Fish Oil1 g"): that row has the time lit and shows the dose.
export const expectScheduledAt = async (page, slot, texts) => {
  for (const t of texts) {
    const [, name, dose] = t.match(/^(.*?)(\d.*)?$/);
    await expect(suppChip(page, name, slot)).toHaveAttribute('aria-pressed', 'true');
    if (dose) await expect(suppRow(page, name)).toContainText(dose);
  }
};
