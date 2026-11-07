import { test, expect } from './fixtures.js';

// The Weight step an exercise goes up by: set from the Log sheet (beside Equipment) or the Exercise library's Edit sheet, kept for the exercise,
// and refused when it is not a usable number. The number it produces (next weight, isometric back-off) is a unit test in logic.test.js; this
// covers the wiring a node test cannot show: the field is in both sheets, saving keeps it, a reload keeps it, a bad value blocks the save.
const CARD = 'A-d1s1';

test('a step set in the Log sheet is kept for the exercise and shows in the Exercise library', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.click(`#log-${CARD}-0`);
  const sheet = page.getByRole('dialog');
  const name = (await sheet.getByRole('heading').first().textContent()).trim();
  const group = sheet.getByRole('group', { name: 'Weight step (lb)' });
  await expect(group).toBeVisible();
  await expect(group.getByRole('textbox')).toHaveAttribute('placeholder', /^Default: \d/);
  await group.getByRole('button', { name: '10', exact: true }).click();
  await expect(group.getByRole('button', { name: '10', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await sheet.locator('input[aria-label^="Set 1 weight"]').fill('100');
  await sheet.locator('input[aria-label^="Set 1 reps"]').fill('8');
  await sheet.getByRole('button', { name: 'Save set' }).click();
  await expect(sheet).toHaveCount(0);

  await page.reload();
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Exercises', exact: true }).click();
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  const lib = page.getByRole('dialog').getByRole('group', { name: 'Weight step (lb)' });
  await expect(lib.getByRole('textbox')).toHaveValue('10');
  await expect(lib.getByRole('button', { name: '10', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('tapping the lit chip again clears the step; a bad number is refused and nothing is saved', async ({ page }) => {
  await page.click(`#log-${CARD}-0`);
  const name = (await page.getByRole('dialog').getByRole('heading').first().textContent()).trim();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Exercises', exact: true }).click();
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  const dlg = page.getByRole('dialog');
  const group = dlg.getByRole('group', { name: 'Weight step (lb)' });
  const five = group.getByRole('button', { name: '5', exact: true });
  await five.click();
  await expect(five).toHaveAttribute('aria-pressed', 'true');
  await five.click();
  await expect(five).toHaveAttribute('aria-pressed', 'false');
  await expect(group.getByRole('textbox')).toHaveValue('');

  await group.getByRole('textbox').fill('60');
  await expect(group.getByRole('alert')).toContainText('up to 50');
  await dlg.getByRole('button', { name: /^Save/ }).click();
  await expect(group.getByRole('alert')).toBeVisible(); // still open: refused
  await group.getByRole('textbox').fill('7.5');
  await expect(group.getByRole('alert')).toHaveCount(0);
});
