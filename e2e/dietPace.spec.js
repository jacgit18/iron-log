import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Diet pace: how fast to gain or lose. The numbers (presets, limits, the calorie floor, the goal date) are node tests in dietTarget.test.ts; this covers
// what a unit test cannot see: the picker on the card, the pick surviving a reload, Custom, the goal date's "By date" choice, and the missing-input buttons.
const seed = (page, { goal, weight, by }) => page.addInitScript(([g, w, b]) => {
  if (localStorage.getItem('ironlog:config/main')) return; // seed once: the script runs again on every reload and would wipe what the test saved
  localStorage.setItem('ironlog:config/main', JSON.stringify(g ? { bwGoal: { w: g, ...(b ? { by: b } : {}) } } : {}));
  if (w) localStorage.setItem('ironlog:body/main', JSON.stringify({ schema: 1, entries: [{ wk: '2026-09-20', d: '2026-09-21', w }] }));
}, [goal, weight, by]);
const diet = page => page.getByRole('region', { name: 'Diet' });
const nutrition = async page => { await page.click('#tab-daily'); await page.click('#daily-supplements'); };
const chip = (page, name) => diet(page).getByRole('button', { name: new RegExp(`^${name}`) });

test('gaining: Steady is picked, Fast and Slow change the calories, and the pick survives a reload', async ({ page }) => {
  await seed(page, { goal: 185, weight: 170 });
  await page.reload();
  await nutrition(page);
  await expect(chip(page, 'Steady')).toHaveAttribute('aria-pressed', 'true');
  await expect(diet(page)).toContainText('2,800 kcal');
  await chip(page, 'Fast').click();
  await expect(diet(page)).toContainText('3,050 kcal');
  await expect(diet(page)).toContainText('plus 500 a day to gain about 1 lb a week');
  await page.reload();
  await nutrition(page);
  await expect(chip(page, 'Fast')).toHaveAttribute('aria-pressed', 'true');
  await chip(page, 'Slow').click();
  await expect(diet(page)).toContainText('2,675 kcal');
});

test('cutting: a goal under your weight is recommended, not refused, and Custom takes your own pace', async ({ page }) => {
  await seed(page, { goal: 165, weight: 180 });
  await page.reload();
  await nutrition(page);
  await expect(diet(page)).not.toContainText('Cutting isn’t supported');
  await expect(diet(page)).toContainText('2,200 kcal');
  await expect(diet(page)).toContainText('130 g protein');
  await expect(diet(page)).toContainText('About 2,700 to stay the same, minus 500 a day to lose about 1 lb a week; about 15 weeks to 165 lb');
  await chip(page, 'Custom').click();
  await page.locator('#dp-rate').fill('0.75');
  await page.locator('#dp-rate').blur();
  await expect(diet(page)).toContainText('2,325 kcal');
  await page.locator('#dp-rate').fill('9');
  await page.locator('#dp-rate').blur();
  await expect(diet(page).getByRole('alert')).toContainText('Pace must be');
  await expect(diet(page)).toContainText('2,325 kcal'); // the last good pace stays in force
});

test('a cut is held at the calorie floor and says so', async ({ page }) => {
  await seed(page, { goal: 100, weight: 120 });
  await page.reload();
  await nutrition(page);
  await chip(page, 'Fast').click();
  await expect(diet(page)).toContainText('1,500 kcal');
  await expect(diet(page)).toContainText('Calories are held at 1,500');
});

test('Custom works when the calorie floor holds the pace under the lowest rate you can type', async ({ page }) => {
  await seed(page, { goal: 95, weight: 101 }); // 1,525 to stay the same, floor 1,500: the held pace is 0.05 lb a week
  await page.reload();
  await nutrition(page);
  await chip(page, 'Custom').click();
  await expect(chip(page, 'Custom')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#dp-rate')).toHaveValue('0.1');
});

test('with a goal date, By date is the default and a preset overrides it', async ({ page }) => {
  const by = new Date(Date.now() + 105 * 864e5).toISOString().slice(0, 10); // about 15 weeks away: 15 lb in 15 weeks is 1 lb a week
  await seed(page, { goal: 165, weight: 180, by });
  await page.reload();
  await nutrition(page);
  await expect(chip(page, 'By date')).toHaveAttribute('aria-pressed', 'true');
  await chip(page, 'Slow').click();
  await expect(diet(page)).toContainText('2,450 kcal');
  await chip(page, 'By date').click();
  await expect(chip(page, 'By date')).toHaveAttribute('aria-pressed', 'true');
  await expect(diet(page)).not.toContainText('2,450 kcal');
});

test('an unsafe goal weight gets no recommendation, a note, and a way to change it', async ({ page }) => {
  await seed(page, { goal: 110, weight: 180 }); // more than a third off
  await page.reload();
  await nutrition(page);
  await expect(diet(page)).toContainText('No target yet');
  await expect(diet(page)).toContainText('doctor or dietitian');
  await expect(chip(page, 'Steady')).toHaveCount(0);
  await diet(page).getByRole('button', { name: 'Change goal weight' }).click();
  await expect(page.locator('#tab-progress')).toHaveAttribute('aria-selected', 'true');
});

test('with no goal weight there is a button to set one', async ({ page }) => {
  await nutrition(page);
  await expect(diet(page).getByRole('button', { name: 'Set a goal weight' })).toBeVisible();
});

test('with a goal but no weight logged there is a button to log it', async ({ page }) => {
  await seed(page, { goal: 185 });
  await page.reload();
  await nutrition(page);
  await expect(diet(page).getByRole('button', { name: 'Log your weight' })).toBeVisible();
});

test('a typed number shows the recommended one beside it', async ({ page }) => {
  await seed(page, { goal: 185, weight: 170 });
  await page.reload();
  await nutrition(page);
  await diet(page).getByRole('button', { name: 'Edit target' }).click();
  await page.locator('#dt-tk').fill('3000');
  await diet(page).getByRole('button', { name: 'Save target' }).click();
  await expect(diet(page)).toContainText('your number, recommended 2,800');
});

test('the pace picker passes axe and its buttons are 44px tall', async ({ page }) => {
  await seed(page, { goal: 185, weight: 170 });
  await page.reload();
  await nutrition(page);
  const { violations } = await new AxeBuilder({ page }).include('#diet-h').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => v.id)).toEqual([]);
  for (const b of await diet(page).locator('.dp-chip').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
});
