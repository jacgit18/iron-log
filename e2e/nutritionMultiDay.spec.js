import { test, expect } from './fixtures.js';
import { closeSheet, moveCard, openAdd, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Brief nutrition-multi-day-picker: the one day picker (quick picks, week strip with arrows, tick several days) on eaten rows, planned cards and the Add sheet. Which days are greyed and why, the quick-pick day sets and the sentences are node tests
// (src/lib/dayPicker.test.ts); this covers the wiring. The fixed clock is Thursday 2026-09-24, 18:30; the Saturday test moves it to Saturday 2026-09-26.
const TODAY = '2026-09-24', TOMORROW = '2026-09-25';
const mk = (id, n, cat, kcal, p) => ({ id, n, cat, ing: [{ n: 'x' }], steps: ['Cook.'], kcal, p });
const seed = async (page, diet = []) => {
  await page.evaluate(([r, d]) => { localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: r })); localStorage.setItem('ironlog:diet/main', JSON.stringify({ items: d })); }, [[mk('rice', 'Rice', 'carbs', 200, 4), mk('chili', 'Chili', 'protein', 400, 30)], diet]);
  await page.reload();
  await openNutrition(page);
};
const col = (page, day) => page.locator(`.nb-col[data-day="${day}"]`);
const sheet = page => page.getByRole('dialog');
const picker = (page, label) => sheet(page).getByRole('group', { name: label });
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:diet/main') || '{}').items || []);
const openRow = (page, name, day = TODAY) => col(page, day).locator('.nb-eatrow', { hasText: name }).first().click();
const planOn = async (page, day, name, meal = 'Dinner') => {
  await col(page, day).locator('.nb-dayname').click();
  const s = await openAdd(page, 'Recipes');
  await s.getByRole('group', { name: 'Which meal' }).getByRole('button', { name: meal, exact: true }).click();
  await s.getByLabel('Find a recipe').fill(name);
  await s.getByRole('button', { name: `Plan ${name} for ${meal}` }).click();
  await closeSheet(page);
};

test('eaten row: Copy to ticks earlier days, one entry per day, the original stays, one sentence', async ({ page }) => {
  await seed(page, [{ id: 'soup', d: TODAY, n: 'Soup', kcal: 200, p: 10, t: 12 }]);
  await openRow(page, 'Soup');
  await sheet(page).getByRole('button', { name: 'Copy to…' }).click();
  const g = picker(page, 'Copy to day');
  await expect(sheet(page).getByRole('button', { name: 'Pick a day' })).toBeDisabled();
  await g.getByRole('button', { name: 'Tue 22', exact: true }).click();
  await g.getByRole('button', { name: 'Wed 23', exact: true }).click();
  await expect(sheet(page).getByText('Chosen: Tue 22, Wed 23')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Copy to 2 days' }).click();
  await expect(page.locator('.nb-msg')).toHaveText('Copied to 2 days.');
  expect((await stored(page)).map(e => e.d).sort()).toEqual(['2026-09-22', '2026-09-23', TODAY]);
});

test('eaten row with a recipe link: a quick pick copies to days ahead as plan cards', async ({ page }) => {
  await seed(page, [{ id: 'rice1', d: TODAY, n: 'Rice', kcal: 200, p: 4, from: 'rice', t: 12 }]);
  await openRow(page, 'Rice');
  await sheet(page).getByRole('button', { name: 'Copy to…' }).click();
  await picker(page, 'Copy to day').getByRole('button', { name: 'Tomorrow' }).click();
  await sheet(page).getByRole('button', { name: 'Copy to Fri 25' }).click();
  await expect(page.locator('.nb-msg')).toHaveText('Copied to Fri 25.');
  await expect(col(page, TOMORROW).locator('.wb-card', { hasText: 'Rice' })).toBeVisible();
  expect(await stored(page)).toHaveLength(1); // a day ahead is a plan card, not a log entry
});

test('eaten one-off food: days ahead are greyed with the reason and there are no quick picks', async ({ page }) => {
  await seed(page, [{ id: 'soup', d: TODAY, n: 'Soup', kcal: 200, p: 10, t: 12 }]);
  await openRow(page, 'Soup');
  await sheet(page).getByRole('button', { name: 'Copy to…' }).click();
  await expect(picker(page, 'Quick picks')).toHaveCount(0);
  await picker(page, 'Copy to day').getByRole('button', { name: 'Later week' }).click();
  await expect(picker(page, 'Copy to day').getByRole('button', { name: /^Mon 28/ })).toBeDisabled();
  await expect(sheet(page).getByText('One-off foods can’t be planned.')).toBeVisible();
});

test('Move takes one day, shows Undo, and Undo puts the food back with nothing duplicated', async ({ page }) => {
  await seed(page, [{ id: 'soup', d: TODAY, n: 'Soup', kcal: 200, p: 10, t: 12 }]);
  await openRow(page, 'Soup');
  await sheet(page).getByRole('button', { name: 'Move to…' }).click();
  await expect(picker(page, 'Quick picks')).toHaveCount(0);
  const g = picker(page, 'Move to day');
  await g.getByRole('button', { name: 'Tue 22', exact: true }).click();
  await g.getByRole('button', { name: 'Wed 23', exact: true }).click(); // a second tick replaces the first
  await sheet(page).getByRole('button', { name: 'Move to Wed 23' }).click();
  expect((await stored(page)).map(e => e.d)).toEqual(['2026-09-23']);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await stored(page)).map(e => [e.id, e.d])).toEqual([['soup', TODAY]]);
});

test('planned card: Copy to ticks several days, keeps the meal, skips a day that holds it and says so', async ({ page }) => {
  await seed(page);
  await planOn(page, TOMORROW, 'Chili');
  await planOn(page, '2026-09-26', 'Chili'); // Sat 26 already has it in Dinner
  const c = col(page, TOMORROW);
  await c.locator('.wb-card', { hasText: 'Chili' }).click();
  await c.getByRole('button', { name: 'Copy Chili', exact: true }).click();
  const g = picker(page, 'Copy Chili to day');
  await expect(g.getByRole('button', { name: /^Fri 25/ })).toBeDisabled(); // its own day
  await g.getByRole('button', { name: 'Thu 24 · today', exact: true }).click();
  await g.getByRole('button', { name: 'Sat 26', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Copy to 2 days' }).click();
  await expect(page.locator('.nb-msg')).toHaveText('Copied to Thu 24. Skipped Sat 26: already there.');
  await expect(todayCol(page).locator('.wb-slot', { hasText: 'Dinner' }).locator('.wb-card', { hasText: 'Chili' })).toBeVisible();
});

test('planned card: Move uses the picker plus a meal chip; a meal alone moves it within the day', async ({ page }) => {
  await seed(page);
  await planOn(page, TOMORROW, 'Chili');
  const c = col(page, TOMORROW);
  await moveCard(page, c, 'Chili', { meal: 'Lunch' });
  await expect(c.locator('.wb-slot', { hasText: 'Lunch' }).locator('.wb-card', { hasText: 'Chili' })).toBeVisible();
  await moveCard(page, c, 'Chili', { day: 'Sat 26', meal: 'Dinner' });
  await expect(page.locator('.nb-msg')).toHaveText('Moved to Sat 26.');
  await expect(col(page, '2026-09-26').locator('.wb-slot', { hasText: 'Dinner' }).locator('.wb-card', { hasText: 'Chili' })).toBeVisible();
  await expect(c.locator('.wb-card', { hasText: 'Chili' })).toHaveCount(0);
});

test('Add on a day ahead: This day on plans one card per day to the last plannable day; Pick days uses the picker; today has neither', async ({ page }) => {
  await seed(page);
  await col(page, TOMORROW).locator('.nb-dayname').click();
  let s = await openAdd(page, 'Recipes');
  await s.getByRole('group', { name: 'Which meal' }).getByRole('button', { name: 'Dinner', exact: true }).click();
  await s.getByRole('group', { name: 'Add to' }).getByRole('button', { name: 'This day on' }).click();
  await expect(s.getByText('to Thu 23: one plan card per day.')).toBeVisible(); // the last plannable day is 2027-09-23 (today + 364)
  await s.getByLabel('Find a recipe').fill('Chili');
  await s.getByRole('button', { name: 'Plan Chili for Dinner' }).click();
  await expect(s.getByRole('status').last()).toHaveText('Planned Chili for Dinner on 364 days.');
  await expect(col(page, '2026-09-26').locator('.wb-card', { hasText: 'Chili' })).toBeVisible();
  await s.getByRole('group', { name: 'Add to' }).getByRole('button', { name: 'Pick days' }).click();
  await s.getByLabel('Find a recipe').fill('Rice');
  await s.getByRole('button', { name: 'Plan Rice for Dinner' }).click();
  await expect(s.getByRole('status').last()).toHaveText('Pick a day first.');
  await picker(page, 'Pick days').getByRole('button', { name: 'Fri 25', exact: true }).click();
  await picker(page, 'Pick days').getByRole('button', { name: 'Sat 26', exact: true }).click();
  await s.getByRole('button', { name: 'Plan Rice for Dinner' }).click();
  await expect(s.getByRole('status').last()).toHaveText('Planned Rice for Dinner on 2 days.');
  await closeSheet(page);
  await todayCol(page).locator('.nb-dayname').click();
  s = await openAdd(page);
  await expect(s.getByRole('group', { name: 'Add to' })).toHaveCount(0);
});

test('from a Saturday the next Monday is one arrow away', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-26T12:00:00-04:00'));
  await seed(page, [{ id: 'rice1', d: '2026-09-26', n: 'Rice', kcal: 200, p: 4, from: 'rice', t: 12 }]);
  await openRow(page, 'Rice', '2026-09-26');
  await sheet(page).getByRole('button', { name: 'Copy to…' }).click();
  const g = picker(page, 'Copy to day');
  await expect(g.getByRole('button', { name: 'Sat 26 · today' })).toBeDisabled(); // the strip opens on today's week; its own day is greyed
  await g.getByRole('button', { name: 'Later week' }).click();
  await g.getByRole('button', { name: 'Mon 28', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Copy to Mon 28' }).click();
  await expect(page.locator('.nb-msg')).toHaveText('Copied to Mon 28.');
});
