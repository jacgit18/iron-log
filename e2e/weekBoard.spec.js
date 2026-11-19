import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSheet, moveCard, openAdd, todayCol } from './nutritionBoardHelpers.js';

// The Nutrition board's planning (brief week-board, part 3, now on the Nutrition week board of brief nutrition-board). The rules (the day's meals and totals, the plate check and fixes, moves, the fat bar) are node tests (weekBoard.test.ts, plate.test.ts);
// this covers the wiring: the board opens on a wide screen and one day with a stepper on a phone, planning into a meal from the add sheet, the plate check and its one-tap fix, moving a card, and the labelled meters.
const mk = (id, n, cat, kcal, p, extra = {}) => ({ id, n, cat, ing: [{ n: 'x' }], steps: ['Cook.'], kcal, p, ...extra });
const items = [mk('chili', 'Chili', 'protein', 400, 30, { f: 14, pairs: ['rice'] }), mk('rice', 'Rice', 'carbs', 200, 4, { f: 1, pairs: ['chili'] }), mk('salad', 'Side salad', 'sides', 80, 3, { f: 4 })];
const TOMORROW = '2026-09-25'; // the fixed clock is Thursday 2026-09-24
const seed = async page => {
  await page.evaluate(l => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })), items);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-supplements');
  await expect(page.locator('#nb-h')).toBeVisible();
};
const board = page => page.locator('.nb');
const today = page => todayCol(page);
const col = (page, day) => page.locator(`.nb-col[data-day="${day}"]`);
const dinner = (c) => c.locator('.wb-slot', { hasText: 'Dinner' });
// A day's planned card moved to today (the add sheet no longer plans on today, so a test that needs a planned card on today plans a day ahead and moves it, which is also how a person does it).
const moveToToday = async (page, name, from) => {
  await moveCard(page, col(page, from), name, { day: 'Thu 24 · today' });
  await todayCol(page).locator('.nb-dayname').click();
};
// Plans a recipe into a meal of the board's selected day from the add sheet's Recipes way (a day on a wide screen is picked by its name).
const plan = async (page, name, { day, meal = 'Dinner' } = {}) => {
  if (!day || day === '2026-09-24') { await plan(page, name, { day: TOMORROW, meal }); await moveToToday(page, name, TOMORROW); return; }
  await col(page, day).locator('.nb-dayname').click();
  const sheet = await openAdd(page, 'Recipes');
  await sheet.getByRole('group', { name: 'Which meal' }).getByRole('button', { name: meal, exact: true }).click();
  await sheet.getByLabel('Find a recipe').fill(name);
  await sheet.getByRole('button', { name: `Plan ${name} for ${meal}` }).click();
  await closeSheet(page);
};

test('a wide screen opens the board: seven days, meals each, meters with words', async ({ page }) => {
  await seed(page);
  await expect(board(page).locator('.nb-col')).toHaveCount(7);
  for (const m of ['Breakfast', 'Lunch', 'Snack', 'Dinner']) await expect(today(page).locator('.wb-slothd', { hasText: m })).toBeVisible(); // Snack is always there, between Lunch and Dinner (brief daily-snacks)
  await expect(today(page).getByText('Nothing planned')).toHaveCount(3);
  await expect(today(page).getByRole('button', { name: /^Add to / })).toHaveCount(0); // meals have no add button of their own
  for (const b of ['Calories', 'Protein']) await expect(today(page).getByRole('img', { name: new RegExp(`^${b} eaten so far: `) })).toBeVisible();
  await expect(col(page, TOMORROW).getByRole('img', { name: /^Calories eaten so far: / })).toBeVisible();
});

test('planning Dinner shows the card, the plate check and a fix that goes with the food', async ({ page }) => {
  await seed(page);
  await plan(page, 'Chili');
  await expect(dinner(today(page)).getByText('Chili', { exact: true })).toBeVisible();
  await expect(dinner(today(page)).getByText('400 kcal · P 30 g')).toBeVisible();
  const check = dinner(today(page)).getByRole('group', { name: 'Dinner plate check' });
  await expect(check).toHaveCount(0); // available food is a menu: the plate check reads planned items only (brief nutrition-board-available-list)
  const markPlanned = async name => { await dinner(today(page)).getByRole('button', { name: new RegExp(`^${name}`) }).first().click(); await dinner(today(page)).getByRole('button', { name: `Mark planned ${name}` }).click(); };
  await markPlanned('Chili');
  await expect(check).toContainText('✓ Protein');
  await expect(check).toContainText('Carb');
  await expect(check).not.toContainText('✓ Carb');
  await dinner(today(page)).getByRole('button', { name: '+ Add a carb: Rice (goes with Chili)' }).click(); // Rice goes with Chili
  await expect(check).not.toContainText('✓ Carb'); // the fix adds Rice as available
  await markPlanned('Rice');
  await expect(check).toContainText('✓ Carb');
  await expect(dinner(today(page)).locator('.wb-ct', { hasText: 'Rice' })).toBeVisible();
  // today's meters count what was eaten, so nothing planned moves them; the meal header tells the menu in words, never calories nobody ate (brief nutrition-board-available-list)
  await expect(dinner(today(page)).locator('.wb-slothd')).toContainText('2 on the menu');
  // a day ahead's bars wait for eaten food (ADR 126) and the plan is a muted line; both foods have a fat figure, so the line carries it whole
  await plan(page, 'Chili', { day: TOMORROW });
  await plan(page, 'Rice', { day: TOMORROW });
  const next = col(page, TOMORROW);
  await expect(next.getByRole('img', { name: /^Calories eaten so far: 0 / })).toBeVisible();
  await expect(next.locator('.nb-planline')).toHaveText('Planned: 600 kcal · 34 g protein · 15 g fat');
});

test('Move to changes the meal of a card, and a card can be moved to another day', async ({ page }) => {
  await seed(page);
  await plan(page, 'Chili');
  const t = today(page);
  await moveCard(page, t, 'Chili', { meal: 'Lunch' });
  await expect(t.locator('.wb-slot', { hasText: 'Lunch' }).getByText('Chili', { exact: true })).toBeVisible();
  await expect(dinner(t).getByText('Chili', { exact: true })).toHaveCount(0);
  await moveCard(page, t, 'Chili', { day: 'Fri 25' });
  await expect(t.getByText('Chili', { exact: true })).toHaveCount(0);
  await expect(col(page, TOMORROW).getByText('Chili', { exact: true })).toBeVisible();
});

test('a planned card has a check box only on today; checking it marks it eaten and logs it, unchecking removes the log', async ({ page }) => {
  await seed(page);
  await plan(page, 'Chili');
  await plan(page, 'Chili', { day: TOMORROW });
  await col(page, TOMORROW).getByText('Chili', { exact: true }).click();
  await expect(col(page, TOMORROW).getByRole('button', { name: 'Remove Chili' })).toBeVisible();
  await expect(col(page, TOMORROW).getByRole('checkbox', { name: /as eaten/ })).toHaveCount(0);
  const box = today(page).getByRole('checkbox', { name: 'Check Chili as eaten' });
  await box.click();
  await expect(today(page).getByRole('checkbox', { name: 'Uncheck Chili as eaten' })).toBeChecked();
  await expect(today(page).locator('.nb-eat')).toHaveCount(0); // planned food is not listed again: its meal shows the check
  await today(page).getByRole('checkbox', { name: 'Uncheck Chili as eaten' }).click();
  await expect(today(page).getByRole('checkbox', { name: 'Check Chili as eaten' })).not.toBeChecked();
});

test('on a phone the board shows one day at a time, with the joined day tabs', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await seed(page);
  await expect(board(page).locator('.nb-col')).toHaveCount(1);
  await expect(page.locator('.wdc-tabs [role="tab"]')).toHaveCount(7);
  await page.locator('.wdc-tabs [role="tab"][aria-selected="true"] + [role="tab"]').click();
  await expect(board(page).locator('.nb-col')).toHaveAttribute('data-day', TOMORROW);
  const axe = await new AxeBuilder({ page }).include('.wb').analyze();
  expect(axe.violations).toEqual([]);
  for (const b of await board(page).getByRole('button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(43.5);
});

test('the board has no accessibility violations on a wide screen', async ({ page }) => {
  await seed(page);
  await plan(page, 'Chili');
  const axe = await new AxeBuilder({ page }).include('.wb').analyze();
  expect(axe.violations).toEqual([]);
});
