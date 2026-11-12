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
// The Manage sheet (daily targets, weight and goal, water, library), opened from the board header. Returns the dialog.
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
// Open a day's Totals sheet from its column (brief nutrition-manage-cleanup): the Supplements section's Totals button when it is shown, otherwise the vitamin meter's own way in (open the line, then Open Totals / All N in Totals).
export const openDayTotals = async col => {
  const direct = col.locator('[id^="nb-supp-totals-"]');
  const tog = col.locator('.nb-vit-tog');
  await expect(direct.or(tog).first()).toBeVisible();
  if (await direct.count()) { await direct.click(); return; }
  if ((await tog.getAttribute('aria-expanded')) !== 'true') await tog.click();
  await col.locator('.nb-vit-all').click();
};
