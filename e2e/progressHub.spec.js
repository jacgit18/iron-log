import { test, expect } from './fixtures.js';

// These are the hub (a window under 1280px); from 1280px Progress is one page (progressOnePage.spec.js).
test.use({ viewport: { width: 1100, height: 900 } });

// Progress as one page: summary, recent weeks, the muscle box, a filter line, Weight goals, Exercises, the Body weight panel, then two tiles. The fixture's clock is Thu Sep 24 2026.
// Seed: Hack Squat (quads) and Lat Pulldown (lats), each with a log and a goal; nothing on the chest.
const seed = page => page.addInitScript(() => {
  if (localStorage.getItem('ironlog:seeded')) return; // only on the first load, so a goal removed in a test stays removed
  localStorage.setItem('ironlog:seeded', '1');
  localStorage.setItem('ironlog:logs/hack', JSON.stringify({ entries: [{ id: 'h1', d: '2026-09-22', w: 135, s: 3, r: 8, ph: 'hyp' }] }));
  localStorage.setItem('ironlog:logs/latpd', JSON.stringify({ entries: [{ id: 'l1', d: '2026-09-21', w: 100, s: 3, r: 8, ph: 'hyp' }] }));
  localStorage.setItem('ironlog:config/main', JSON.stringify({ liftGoals: { hack: { any: { w: 300 } }, latpd: { any: { w: 200 } } } }));
});
const wide = page => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const open = async page => { await page.click('#tab-progress'); await expect(page.locator('.figs')).toBeVisible(); };
const tapMuscle = (page, name) => page.locator('.figs path.mu', { hasText: name + ':' }).first().click();
const goals = page => page.locator('section.mlists', { has: page.getByRole('heading', { name: 'Weight goals' }) });
const exercises = page => page.locator('section.mlists', { has: page.getByRole('heading', { name: 'Exercises' }) });

test('one page with no Progress/Muscles switch, sections in order', async ({ page }) => {
  await seed(page);
  await page.reload();
  await open(page);
  await expect(page.locator('#prog-muscles')).toHaveCount(0);
  await expect(page.locator('#prog-trends')).toHaveCount(0);
  const tops = [];
  for (const loc of [page.locator('.kpis'), page.getByRole('heading', { name: 'Weekly history' }), page.locator('.figs'), page.locator('.chiprow'),
    page.getByRole('heading', { name: 'Weight goals' }), page.getByRole('heading', { name: 'Exercises' }), page.getByRole('heading', { name: 'Body weight', exact: true }), page.locator('.hubtile').first()]) tops.push((await loc.boundingBox()).y);
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
  await expect(page.locator('.hubtile')).toHaveCount(2);
  await expect(page.locator('.mapbox .legend')).toBeVisible();
  await expect(page.locator('.mapbox .mbar').first()).toBeVisible();
});

test('tapping a muscle filters goals and exercises, the chip clears it, and leaving Progress starts unfiltered', async ({ page }) => {
  await seed(page);
  await page.reload();
  await open(page);
  await expect(goals(page).locator('.mlrow')).toHaveCount(2);
  await expect(exercises(page).locator('.mlrow')).toHaveCount(2);
  await tapMuscle(page, 'Quads');
  await expect(page.locator('.fchip')).toContainText('Showing: Quads');
  await expect(goals(page).locator('.mlrow')).toHaveCount(1);
  await expect(goals(page)).toContainText('Hack Squat');
  await expect(exercises(page).locator('.mlrow')).toHaveCount(1);
  await expect(exercises(page)).not.toContainText('Lat Pulldown');
  await page.getByRole('button', { name: /^Clear Quads filter/ }).click();
  await expect(page.locator('.fchip')).toHaveCount(0);
  await expect(exercises(page).locator('.mlrow')).toHaveCount(2);

  await tapMuscle(page, 'Quads');
  await expect(page.locator('.fchip')).toBeVisible();
  await page.click('#tab-daily');
  await page.click('#tab-progress');
  await expect(page.locator('.figs')).toBeVisible();
  await expect(page.locator('.fchip')).toHaveCount(0);
  await expect(exercises(page).locator('.mlrow')).toHaveCount(2);
});

test('a muscle with nothing logged says so in both lists', async ({ page }) => {
  await seed(page);
  await page.reload();
  await open(page);
  await tapMuscle(page, 'Chest');
  await expect(goals(page)).toContainText('No goals on exercises for this muscle.');
  await expect(exercises(page)).toContainText('Nothing logged for this muscle yet.');
});

test('removing the last goal on a row keeps its Undo notice visible', async ({ page }) => {
  await seed(page);
  await page.reload();
  await open(page);
  await goals(page).locator('.mlrow', { hasText: 'Hack Squat' }).click();
  await goals(page).getByRole('button', { name: 'Remove Any phase goal', exact: true }).dblclick();
  const undo = goals(page).getByRole('button', { name: 'Undo' });
  await expect(undo).toBeVisible();
  await expect(goals(page).locator('.mlrow', { hasText: 'Hack Squat' })).toHaveCount(0);
  await undo.click();
  await expect(goals(page).locator('.mlrow', { hasText: 'Hack Squat' })).toHaveCount(1);
});

test('a fresh profile shows the page with no errors and prompts for a first goal', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.reload();
  await open(page);
  await expect(page.getByText('Set a goal on any exercise to track it here.')).toBeVisible();
  await expect(page.getByText('Tap a muscle to filter goals and exercises.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('at 375 wide the page does not scroll sideways, with goals and exercises', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  await page.reload();
  await open(page);
  await expect(exercises(page).locator('.mlrow').first()).toBeVisible();
  expect(await wide(page)).toBe(false);
  await tapMuscle(page, 'Quads');
  expect(await wide(page)).toBe(false);
});
