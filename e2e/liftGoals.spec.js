import { test, expect } from './fixtures.js';

// Progress, Weight goals: a goal on any exercise, including one with no logged set (the status maths is tested in src/lib/liftGoal.test.js).
// These cover the wiring: the picker, the goal form, the row, a later log, Remove with Undo, and a goal set from the exercise sheet.
const panel = page => page.locator('.goalspanel');

test('a goal on an exercise with no log shows in Weight goals, fills in once a set is logged, and Remove has Undo', async ({ page }) => {
  await page.goto('/');
  await page.click('#tab-progress');
  await expect(panel(page)).toContainText('even one you have not logged yet');
  await panel(page).getByRole('button', { name: 'Set a goal' }).click();
  await panel(page).getByRole('combobox', { name: 'Exercise' }).fill('Hack Squat');
  await panel(page).getByRole('option', { name: /Hack Squat/ }).first().click();
  await panel(page).getByLabel('Goal (lb)').fill('225');
  await panel(page).getByRole('button', { name: 'Save goal' }).click();
  const row = panel(page).locator('.goalrow');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Hack Squat');
  await expect(row).toContainText('Any phase: 225 lb');
  await expect(row).toContainText('Log a set');

  await page.evaluate(() => localStorage.setItem('ironlog:logs/hack', JSON.stringify({ schema: 1, entries: [{ id: 's1', d: '2026-09-21', w: 135, s: 3, r: 8, ph: 'hyp' }] })));
  await page.reload();
  await page.click('#tab-progress');
  await expect(panel(page).locator('.goalrow')).toContainText('135 lb');

  await panel(page).getByRole('button', { name: 'Any phase goal', exact: true }).dblclick();
  await expect(panel(page).locator('.goalrow .goalitem')).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Undo' }).click();
  await expect(panel(page).locator('.goalrow .goalitem')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('cancel leaves no goal; a goal already set from the exercise sheet is listed too', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:logs/hack', JSON.stringify({ schema: 1, entries: [{ id: 's1', d: '2026-09-21', w: 135, s: 3, r: 8, ph: 'hyp' }] }));
  });
  await page.goto('/');
  await page.click('#tab-progress');
  await panel(page).getByRole('button', { name: 'Set a goal' }).click();
  await panel(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(panel(page).locator('.goalrow')).toHaveCount(0);

  await page.locator('.pcard', { hasText: 'Hack Squat' }).click();
  await page.getByRole('dialog').locator('.bwgoal').getByRole('button', { name: 'Set a goal' }).click();
  await page.getByRole('dialog').locator('.bwgoal').getByLabel('Goal (lb)').fill('315');
  await page.getByRole('dialog').locator('.bwgoal').getByRole('button', { name: 'Save goal' }).click();
  await page.keyboard.press('Escape');
  await expect(panel(page).locator('.goalrow')).toContainText('315 lb');
});
