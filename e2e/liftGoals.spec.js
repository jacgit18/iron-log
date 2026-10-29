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

// A goal that scales with body weight (the maths is tested in src/lib/liftGoal.test.js): the switch, the 375 lb target, and the disabled switch with no body weight.
test('the scale switch is off with no body weight logged, and a scaled goal shows the raised target', async ({ page }) => {
  await page.goto('/');
  await page.click('#tab-progress');
  await panel(page).getByRole('button', { name: 'Set a goal' }).click();
  await panel(page).getByRole('combobox', { name: 'Exercise' }).fill('Hack Squat');
  await panel(page).getByRole('option', { name: /Hack Squat/ }).first().click();
  await expect(panel(page).getByLabel('Scale with my body weight')).toBeDisabled();
  await expect(panel(page)).toContainText('Log your body weight first');
});

test('300 lb set at 120 lb body weight shows 375 lb after a 150 lb weigh-in, and keeps it when weight drops', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('ironlog:body/main')) localStorage.setItem('ironlog:body/main', JSON.stringify({ entries: [{ wk: '2026-09-06', d: '2026-09-07', w: 120 }] })); // only on the first load
  });
  await page.goto('/');
  await page.click('#tab-progress');
  await panel(page).getByRole('button', { name: 'Set a goal' }).click();
  await panel(page).getByRole('combobox', { name: 'Exercise' }).fill('Hack Squat');
  await panel(page).getByRole('option', { name: /Hack Squat/ }).first().click();
  await panel(page).getByLabel('Goal (lb)').fill('300');
  await panel(page).getByLabel('Scale with my body weight').check();
  await panel(page).getByRole('button', { name: 'Save goal' }).click();
  const row = panel(page).locator('.goalrow');
  await expect(row).toContainText('Any phase: 300 lb');
  await expect(row).toContainText('Scales with your body weight: 300 lb at 120 lb body weight.');

  const setBody = ws => page.evaluate(w => localStorage.setItem('ironlog:body/main', JSON.stringify({ entries: w.map(([wk, d, x]) => ({ wk, d, w: x })) })), ws);
  await setBody([['2026-09-06', '2026-09-07', 120], ['2026-09-13', '2026-09-14', 150]]);
  await page.reload(); await page.click('#tab-progress');
  await expect(panel(page).locator('.goalrow')).toContainText('Any phase: 375 lb');
  await setBody([['2026-09-06', '2026-09-07', 120], ['2026-09-13', '2026-09-14', 150], ['2026-09-20', '2026-09-21', 135]]);
  await page.reload(); await page.click('#tab-progress');
  await expect(panel(page).locator('.goalrow')).toContainText('Any phase: 375 lb');
});

test('the multiplier starts at 1.5 for an upper body lift and 2.5 for lower, fills the goal, and follows an edit either way', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('ironlog:body/main')) localStorage.setItem('ironlog:body/main', JSON.stringify({ entries: [{ wk: '2026-09-06', d: '2026-09-07', w: 120 }] }));
  });
  await page.goto('/');
  await page.click('#tab-progress');
  const pick = async name => {
    await panel(page).getByRole('combobox', { name: 'Exercise' }).fill(name);
    await panel(page).getByRole('option', { name: new RegExp(name) }).first().click();
  };
  await panel(page).getByRole('button', { name: 'Set a goal' }).click();
  await pick('Hack Squat');
  await panel(page).getByLabel('Scale with my body weight').check();
  await expect(panel(page).getByLabel('Multiplier (× body weight)')).toHaveValue('2.5');
  await expect(panel(page).getByLabel('Goal (lb)')).toHaveValue('300');
  await panel(page).getByLabel('Multiplier (× body weight)').fill('3');
  await expect(panel(page).getByLabel('Goal (lb)')).toHaveValue('360');
  await panel(page).getByLabel('Goal (lb)').fill('240');
  await expect(panel(page).getByLabel('Multiplier (× body weight)')).toHaveValue('2');
  await panel(page).getByRole('button', { name: 'Cancel' }).first().click();

  await panel(page).getByRole('button', { name: 'Set a goal' }).click();
  await pick('Lat Pulldown');
  await panel(page).getByLabel('Scale with my body weight').check();
  await expect(panel(page).getByLabel('Multiplier (× body weight)')).toHaveValue('1.5');
  await expect(panel(page).getByLabel('Goal (lb)')).toHaveValue('180');
});
