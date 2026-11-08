import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// The week board (brief week-board, part 3). The rules (the day's meals and totals, the plate check and fixes, moves, the fat bar) are node tests (weekBoard.test.ts, plate.test.ts);
// this covers the wiring: the board opens on a wide screen and the list on a phone, adding to a meal, the plate check and its one-tap fix, moving a card, and the labelled bars.
const mk = (id, n, cat, kcal, p, extra = {}) => ({ id, n, cat, ing: [{ n: 'x' }], steps: ['Cook.'], kcal, p, ...extra });
const items = [mk('chili', 'Chili', 'protein', 400, 30, { f: 14, pairs: ['rice'] }), mk('rice', 'Rice', 'carbs', 200, 4, { f: 1, pairs: ['chili'] }), mk('salad', 'Side salad', 'sides', 80, 3, { f: 4 })];
const seed = async page => {
  await page.evaluate(l => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })), items);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-supplements');
};
const plan = page => page.locator('.dt-plan');
const board = page => plan(page).locator('.wb');
const today = page => board(page).locator('.wb-col.today');
const dinner = page => today(page).locator('.wb-slot', { hasText: 'Dinner' });
const addToDinner = async (page, name) => {
  await dinner(page).getByRole('button', { name: /^Add to Dinner/ }).click();
  await dinner(page).getByLabel('Find a recipe').fill(name);
  await dinner(page).getByRole('button', { name, exact: true }).click();
};

test('a wide screen opens the Board: seven days, four meals each, bars with words', async ({ page }) => {
  await seed(page);
  await expect(board(page)).toBeVisible();
  await expect(board(page).locator('.wb-col')).toHaveCount(7);
  await expect(today(page).locator('.wb-slot')).toHaveCount(4);
  for (const m of ['Breakfast', 'Lunch', 'Dinner', 'Snack']) await expect(today(page).getByText(m, { exact: true })).toBeVisible();
  for (const b of ['Calories', 'Protein']) await expect(today(page).getByRole('meter', { name: `${b} planned` })).toBeVisible();
});

test('adding to Dinner shows the card, the plate check and a fix that goes with the food', async ({ page }) => {
  await seed(page);
  await addToDinner(page, 'Chili');
  await expect(dinner(page).getByText('Chili', { exact: true })).toBeVisible();
  await expect(dinner(page).getByText('400 kcal · 30 g protein')).toBeVisible();
  const check = dinner(page).getByRole('group', { name: 'Dinner plate check' });
  await expect(check).toContainText('✓ Protein');
  await expect(check).toContainText('Carb');
  await expect(check).not.toContainText('✓ Carb');
  await dinner(page).getByRole('button', { name: '+ Add a carb: Rice (goes with Chili)' }).click(); // Rice goes with Chili
  await expect(check).toContainText('✓ Carb');
  await expect(dinner(page).getByText('Rice', { exact: true })).toBeVisible();
  await expect(today(page).getByRole('meter', { name: 'Calories planned' })).toHaveAttribute('aria-valuenow', '600');
  await expect(today(page).getByText('Add fat to your foods')).toHaveCount(0); // both have a fat figure: the fat bar is whole
  await expect(today(page).getByRole('meter', { name: 'Fat planned' })).toHaveAttribute('aria-valuenow', '15');
});

test('Move to changes the meal of a card, and a card can be moved to another day', async ({ page }) => {
  await seed(page);
  await addToDinner(page, 'Chili');
  await dinner(page).getByText('Chili', { exact: true }).click();
  await dinner(page).getByRole('button', { name: 'Move Chili', exact: true }).click();
  await dinner(page).getByRole('group', { name: 'Move Chili to' }).getByRole('button', { name: 'Lunch' }).click();
  await expect(today(page).locator('.wb-slot', { hasText: 'Lunch' }).getByText('Chili', { exact: true })).toBeVisible();
  await expect(dinner(page).getByText('Chili', { exact: true })).toHaveCount(0);
  await today(page).locator('.wb-slot', { hasText: 'Lunch' }).getByText('Chili', { exact: true }).click();
  await today(page).getByRole('button', { name: 'Move Chili', exact: true }).click();
  await today(page).getByRole('group', { name: 'Move Chili to' }).getByRole('button').filter({ hasText: /^[A-Z][a-z]{2} \d+$/ }).first().click();
  await expect(today(page).getByText('Chili', { exact: true })).toHaveCount(0);
  await expect(board(page).locator('.wb-col').nth(1).getByText('Chili', { exact: true })).toBeVisible();
});

test('on a phone the Plan opens as the List, and the Board shows one day at a time', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await seed(page);
  await expect(plan(page).getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await plan(page).getByRole('button', { name: 'Board', exact: true }).click();
  await expect(board(page).locator('.wb-col')).toHaveCount(1);
  await expect(board(page).getByRole('group', { name: 'Day' }).getByRole('button')).toHaveCount(7);
  await dinner(page).getByRole('button', { name: /^Add to Dinner/ }).click();
  const axe = await new AxeBuilder({ page }).include('.wb').analyze();
  expect(axe.violations).toEqual([]);
  for (const b of await board(page).getByRole('button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(43.5);
});

test('the board has no accessibility violations on a wide screen', async ({ page }) => {
  await seed(page);
  await addToDinner(page, 'Chili');
  const axe = await new AxeBuilder({ page }).include('.wb').analyze();
  expect(axe.violations).toEqual([]);
});
