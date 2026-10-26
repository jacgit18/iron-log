import { test, expect } from './fixtures.js';

// Weekly volume (sets × reps × weight), Personal bests and exercise frequency goals on the Progress tab. The fixture's clock is Thu Sep 24 2026.
const seed = page => page.addInitScript(() => {
  const L = [
    { id: 'h1', d: '2026-09-08', w: 100, s: 3, r: 8, ph: 'hyp' },
    { id: 'h2', d: '2026-09-15', w: 110, s: 3, r: 8, ph: 'hyp' },               // heavier: a best
    { id: 'h3', d: '2026-09-22', w: 200, s: 3, r: 8, ph: 'hyp', auto: true },   // check-off: volume only
  ];
  localStorage.setItem('ironlog:logs/hack', JSON.stringify({ entries: L }));
});

test('weekly volume and personal bests show on a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  await page.goto('/');
  await page.click('#tab-progress');
  const vol = page.locator('.tchart', { has: page.getByRole('heading', { name: 'Weekly volume' }) });
  // This week: the check-off, 3 × 8 × 200.
  await expect(vol.getByRole('listitem').last()).toHaveAttribute('aria-label', /All exercises, week of .* \(so far\): 4,800 lb/);
  await vol.getByRole('combobox', { name: 'Show volume for' }).selectOption({ label: 'Quads' });
  await expect(vol.getByRole('list')).toHaveAttribute('aria-label', 'Weekly volume, quads, in pounds');

  const bests = page.locator('.bests');
  await expect(bests.locator('.bestrow')).toHaveCount(1);
  await expect(bests).toContainText('Hack Squat');
  await expect(bests).toContainText('110 lb × 8');
  await expect(bests).toContainText('was 100 × 8');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  await bests.locator('.bestrow').click();
  await expect(page.locator('table.hist')).toBeVisible();
});

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
