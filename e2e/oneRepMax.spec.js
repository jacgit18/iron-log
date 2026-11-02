import { test, expect } from './fixtures.js';

// Settings, Training, 1-rep maxes: one row per weighted exercise, each worked out from the logged sets (the estimate itself is tested in
// src/lib/oneRepMax.test.ts), and a typed "I tested this" number that wins over it. These cover the wiring: the rows, the exercise screen, the override, Back.
const openMaxes = async page => {
  await page.locator('#tab-settings, #account-badge').first().click();
  await page.locator('#drill-maxes').click();
};

test('an exercise with no log says what to do; one with a logged set of 10 reps or fewer shows an estimate', async ({ page }) => {
  await page.addInitScript(() => {
    const entry = { id: 'seed1', d: '2026-09-24', ph: 'strength', w: 45, s: 3, r: 8, sets: [{ w: 45, r: 8 }, { w: 45, r: 8 }, { w: 45, r: 8 }] };
    localStorage.setItem('ironlog:logs/latpd', JSON.stringify({ schema: 1, entries: [entry] }));
  });
  await page.goto('/');
  await openMaxes(page);
  const rows = page.locator('.sdrill[id^="max-"]');
  expect(await rows.count()).toBeGreaterThan(3);
  await expect(page.locator('#max-latpd')).toContainText('Estimated 57 lb'); // 45 x (1 + 8 / 30)
  await expect(rows.filter({ hasText: 'Log a set of 10 reps or fewer to get an estimate' }).first()).toBeVisible();
  await page.locator('#max-latpd').click();
  await expect(page.locator('.maxdetail .maxsrc')).toHaveText('Estimated');
  await expect(page.locator('.maxdetail')).toContainText('From your best set: 45 lb × 8 (Strength).');
  await expect(page.locator('.maxphase')).toContainText('Target 85%.');
});

test('a typed number wins over the estimate, shows as Tested on the list, and Use estimate takes it away', async ({ page }) => {
  await page.goto('/');
  await openMaxes(page);
  const first = page.locator('.sdrill[id^="max-"]').first();
  const id = (await first.getAttribute('id')).replace('max-', '');
  await first.click();
  await expect(page.locator('.maxdetail h3')).toBeFocused();
  const field = page.locator(`#rm-${id}`);
  await field.fill('300');
  await field.press('Enter');
  await expect(page.locator('.maxdetail .maxnum')).toHaveText('300');
  await expect(page.locator('.maxdetail .maxsrc')).toHaveText('Tested');
  await expect(page.locator('.maxdetail').getByText('✓ Saved')).toBeVisible();
  await page.getByRole('button', { name: '1-rep maxes', exact: true }).click(); // back to the list, not out of Settings
  await expect(page.locator(`#max-${id}`)).toContainText('Tested 300 lb');
  await page.locator(`#max-${id}`).click();
  await page.getByRole('button', { name: 'Use estimate' }).click();
  await expect(page.locator('.maxdetail .maxnum')).toHaveText('—');
  await expect(page.locator(`#max-${id}`)).toHaveCount(0); // (the exercise screen is open here)
  await page.goBack(); // the browser's Back closes the 1-rep max screens: one history entry for all of them
  await expect(page.locator('#drill-maxes')).toBeVisible();
});

test('choosing another tab with an exercise screen open leaves no stale history entry, and 1-rep maxes reopens on its list', async ({ page }) => {
  await page.goto('/');
  await openMaxes(page);
  await page.locator('.sdrill[id^="max-"]').first().click();
  await expect(page.locator('.maxdetail')).toBeVisible();
  await page.locator('#tab-board').click();
  await expect.poll(() => page.evaluate(() => history.state?.settingsScreen ?? null)).toBeNull();
  await openMaxes(page);
  await expect(page.locator('.maxdetail')).toHaveCount(0); // the list, not the old exercise
  await expect(page.locator('.sdrill[id^="max-"]').first()).toBeVisible();
});
