import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Progress on one page from 1280px wide: a rail and every section, no drill-in pages. Under 1280px it is the hub (progressHub.spec.js, navigation.spec.js).
// The fixture's clock is Thu Sep 24 2026. Seed: Hack Squat (quads) and Lat Pulldown (lats), each with a log and a goal.
const seed = page => page.addInitScript(() => {
  if (localStorage.getItem('ironlog:seeded')) return;
  localStorage.setItem('ironlog:seeded', '1');
  localStorage.setItem('ironlog:logs/hack', JSON.stringify({ entries: [{ id: 'h1', d: '2026-09-22', w: 135, s: 3, r: 8, ph: 'hyp' }] }));
  localStorage.setItem('ironlog:logs/latpd', JSON.stringify({ entries: [{ id: 'l1', d: '2026-09-21', w: 100, s: 3, r: 8, ph: 'hyp' }] }));
  localStorage.setItem('ironlog:config/main', JSON.stringify({ liftGoals: { hack: { any: { w: 300 } }, latpd: { any: { w: 200 } } } }));
});
const SECTIONS = ['overview', 'history', 'muscles', 'goals', 'freq', 'lifts', 'trends', 'body'];
const hash = page => page.evaluate(() => location.hash);
const rail = page => page.getByRole('navigation', { name: 'Jump to a Progress section' });
const open = async page => { await page.click('#tab-progress'); await expect(rail(page)).toBeVisible(); };

test('from 1280px: a rail and all eight sections, no hub tiles or "all" buttons', async ({ page }) => {
  await seed(page);
  await page.reload();
  await open(page);
  await expect(rail(page).getByRole('button')).toHaveText(['Overview', 'History', 'Muscles', 'Goals', 'Frequency', 'Exercises', 'Trends', 'Body weight']);
  const tops = [];
  for (const id of SECTIONS) tops.push((await page.locator(`#pg-${id}`).boundingBox()).y);
  expect(tops.every(t => t >= 0)).toBe(true);
  await expect(page.locator('.hubtile')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /All 12 weeks|Manage goals|Exercise charts/ })).toHaveCount(0);
  await expect(page.locator('#pg-history .wkrow')).toHaveCount(1); // only the weeks since the first log, up to 12
  await expect(page.locator('#pg-lifts .pcard')).toHaveCount(2);
  await expect(page.locator('#pg-freq')).toContainText('Exercise frequency');
  await expect(page.locator('#pg-trends')).toContainText('Sets logged per week');
  await expect(page.locator('#pg-body')).toContainText('Body weight');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('a Progress address scrolls to its section, on a reload too, and the rail swaps the address without a Back step', async ({ page }) => {
  await seed(page);
  await page.goto('/#/progress/lifts');
  await expect(rail(page)).toBeVisible();
  await expect.poll(async () => (await page.locator('#pg-lifts').boundingBox()).y).toBeLessThan(300);
  // The rail follows the scroll: the page is too short to put Exercises at the top, so the section read is Exercises or one after it, never one before.
  await expect(rail(page).locator('[aria-current="true"]')).toHaveText(/^(Exercises|Trends|Body weight)$/);
  await page.reload();
  await expect.poll(async () => (await page.locator('#pg-lifts').boundingBox()).y).toBeLessThan(300);
  const before = await page.evaluate(() => history.length);
  await rail(page).getByRole('button', { name: 'Trends' }).click();
  await expect.poll(() => hash(page)).toBe('#/progress/trends');
  await rail(page).getByRole('button', { name: 'Muscles' }).click();
  await expect.poll(() => hash(page)).toBe('#/progress');
  expect(await page.evaluate(() => history.length)).toBe(before);
  await expect(page.locator('.hubback')).toHaveCount(0);
});

test('a muscle picked on the map filters Weight goals and Exercises on the one page', async ({ page }) => {
  await seed(page);
  await page.reload();
  await open(page);
  await expect(page.locator('#pg-lifts .pcard')).toHaveCount(2);
  await expect(page.locator('#pg-goals .goalrow')).toHaveCount(2);
  await page.locator('.figs path.mu', { hasText: 'Quads:' }).first().click();
  await expect(page.locator('.fchip')).toContainText('Showing: Quads');
  await expect(page.locator('#pg-lifts .pcard')).toHaveCount(1);
  await expect(page.locator('#pg-lifts')).not.toContainText('Lat Pulldown');
  await expect(page.locator('#pg-goals .goalrow')).toHaveCount(1);
  await page.getByRole('button', { name: /^Clear Quads filter/ }).click();
  await expect(page.locator('#pg-lifts .pcard')).toHaveCount(2);
});

test('an empty account reads well: one overview tile and a note in each section', async ({ page }) => {
  await open(page);
  await expect(page.locator('#pg-overview .empty')).toContainText('Nothing to chart yet');
  await expect(page.locator('#pg-lifts .empty')).toContainText('No sessions logged yet');
  await expect(page.locator('#pg-goals')).toContainText('The most weight you want to lift');
  await expect(page.locator('#pg-freq')).toContainText('How many times a week');
  await expect(page.locator('#pg-trends')).toContainText('Log a lift to see charts here');
  await expect(page.locator('#pg-body')).toContainText('Log your weight once a week');
  await expect(page.locator('.pcard')).toHaveCount(0);
});

test('under 1280px it is the hub with drill-in tiles, no rail', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.click('#tab-progress');
  await expect(page.locator('.hubtile')).toHaveCount(2);
  await expect(rail(page)).toHaveCount(0);
  await page.locator('.hubtile').first().click();
  await expect(page.locator('.hubback')).toBeVisible();
});

test('the one page has no accessibility violations', async ({ page }) => {
  await seed(page);
  await page.reload();
  await open(page);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
});
