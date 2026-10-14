import { test, expect } from './fixtures.js';

// Exercise frequency goals on the Progress tab. The fixture's clock is Thu Sep 24 2026 (week of Sun Sep 20).
test('set a times-a-week goal, see this week against it, and remove it', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    const L = [
      { id: 'f1', d: '2026-09-21', w: 100, s: 3, r: 8, ph: 'hyp' },
      { id: 'f2', d: '2026-09-23', w: 100, s: 3, r: 8, ph: 'hyp' },
    ];
    localStorage.setItem('ironlog:logs/hack', JSON.stringify({ entries: L }));
  });
  await page.goto('/');
  await page.click('#tab-progress');
  const panel = page.locator('.freqgoals');
  await panel.getByLabel('Exercise').selectOption({ label: 'Hack Squat' });
  await panel.getByLabel('Times a week').selectOption('3');
  await panel.getByRole('button', { name: 'Set a goal' }).click();
  await expect(panel.locator('li')).toContainText('Hack Squat');
  await expect(panel.locator('li')).toContainText('2/3 this week');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  await panel.getByRole('button', { name: 'Remove the Hack Squat frequency goal' }).dblclick();
  await expect(panel.locator('li')).toHaveCount(0);
});
