import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, openNutrition, openTargets, todayCol } from './nutritionBoardHelpers.js';
import { startRecipe } from './recipesNav.js';

// Diet inside Nutrition (ADR 086): the daily calorie, protein, carbs and fat targets (the Diet box under the week board), and the food log, now a day column of the Nutrition week board with food added from the add sheet.
// The rules (the target numbers, totals, caps) are node tests (dietTarget, dietLog, shared/diet, dietSlice); this covers the wiring: the card, typing a target, adding food, "Ate this" on
// a recipe, Undo, the board's days (last week read-only, a day ahead has no eaten list), and that it all survives a reload. Syncing a second device is covered by e2e:sync, not here.
const seedBody = (page, goal, weight) => page.addInitScript(([g, w]) => {
  if (localStorage.getItem('ironlog:config/main')) return; // seed once: the script runs again on every reload and would wipe what the test saved
  localStorage.setItem('ironlog:config/main', JSON.stringify({ bwGoal: { w: g } }));
  localStorage.setItem('ironlog:body/main', JSON.stringify({ schema: 1, entries: [{ wk: '2026-09-20', d: '2026-09-21', w }] }));
}, [goal, weight]);
const diet = page => page.getByRole('dialog', { name: 'Targets and goal' }); // the Targets and goal sheet (it was the Diet panel under the board)
const nutrition = openNutrition;
// The add sheet's One-off food form (always open there); returns the dialog.
const oneOff = page => openAdd(page, 'One-off food');
// Types one food into the open One-off food form and presses Add.
const addFood = async (sheet, name, kcal, p) => {
  await sheet.locator('#dt-add-n').fill(name);
  await sheet.locator('#dt-add-k').fill(String(kcal));
  await sheet.locator('#dt-add-p').fill(String(p));
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
};
const eaten = page => todayCol(page).locator('.nb-eat');
const noViolations = async page => {
  const { violations } = await new AxeBuilder({ page }).include('.nb').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
};

test('Diet is on Nutrition for everyone; with no goal weight it asks for one and still lets you type a target', async ({ page }) => {
  await nutrition(page);
  await expect(todayCol(page).locator('.nb-eat')).toHaveCount(0); // nothing eaten yet: no Also eaten list at all
  await openTargets(page);
  await expect(diet(page).getByRole('heading', { name: 'Targets and goal' })).toBeVisible();
  await expect(diet(page)).toContainText('Set a goal weight under Progress');
  await diet(page).getByRole('button', { name: 'Set target' }).click();
  await page.locator('#dt-tk').fill('3000');
  await page.locator('#dt-tp').fill('180');
  await diet(page).getByRole('button', { name: 'Save target' }).click();
  await expect(diet(page)).toContainText('3,000 kcal');
  await expect(diet(page)).toContainText('180 g protein');
});

test('the target is recommended from the goal weight, and your own number replaces only what you type', async ({ page }) => {
  await seedBody(page, 185, 170);
  await page.reload();
  await nutrition(page);
  await openTargets(page);
  await expect(diet(page)).toContainText('2,800 kcal');
  await expect(diet(page)).toContainText('150 g protein');
  await expect(diet(page)).toContainText('370 g carbs');
  await expect(diet(page)).toContainText('80 g fat');
  await expect(diet(page)).toContainText('not medical advice');
  await expect(diet(page)).toContainText('About 2,550 to stay the same, plus 250 a day to gain about 0.5 lb a week; about 30 weeks to 185 lb');
  await diet(page).getByRole('button', { name: 'Edit target' }).click();
  await page.locator('#dt-tk').fill('3000');
  await diet(page).getByRole('button', { name: 'Save target' }).click();
  await expect(diet(page)).toContainText('3,000 kcal');
  await expect(diet(page)).toContainText('150 g protein');
  await expect(diet(page)).toContainText('410 g carbs'); // carbs and fat follow the calories in force
  await diet(page).getByRole('button', { name: 'Edit target' }).click();
  await page.locator('#dt-tc').fill('450'); // and a typed carbs replaces only itself
  await diet(page).getByRole('button', { name: 'Save target' }).click();
  await expect(diet(page)).toContainText('450 g carbs');
  await expect(diet(page)).toContainText('85 g fat');
  await page.reload();
  await nutrition(page);
  await openTargets(page);
  await expect(diet(page)).toContainText('3,000 kcal');
  await expect(diet(page)).toContainText('450 g carbs');
  await diet(page).getByRole('button', { name: 'Use recommended' }).click();
  await expect(diet(page)).toContainText('2,800 kcal');
  await expect(diet(page)).toContainText('370 g carbs');
});

test('quick add logs a food, the meters move, it is offered again, Delete has Undo, and a reload keeps it', async ({ page }) => {
  await seedBody(page, 185, 170);
  await page.reload();
  await nutrition(page);
  const sheet = await oneOff(page);
  await sheet.locator('#dt-add-c').fill('44');
  await sheet.locator('#dt-add-f').fill('0.5');
  await addFood(sheet, 'Rice', 200, 4);
  await expect(sheet.getByRole('status')).toContainText('Added Rice.');
  await closeSheet(page);
  await expect(eaten(page)).toContainText('Rice');
  await expect(eaten(page)).toContainText('C 44 · F 0.5 g');
  // the board's meters (calories, protein, fat, water) move; carbs have no meter, they show in the entry above
  await expect(todayCol(page).getByRole('img', { name: /Calories eaten so far: 200 \/ 2,800 kcal/ })).toBeVisible();
  await expect(todayCol(page).getByRole('img', { name: /Protein eaten so far: 4 \/ 150 g/ })).toBeVisible();
  await expect(todayCol(page).getByRole('img', { name: /Fat eaten so far: 0.5 \/ 80 g/ })).toBeVisible();
  const quick = await openAdd(page, 'Quick add');
  await quick.getByRole('button', { name: 'Rice · 200 kcal' }).click(); // offered again in one tap
  await closeSheet(page);
  await expect(eaten(page)).toHaveCount(2);
  await todayCol(page).getByRole('button', { name: 'Delete Rice' }).first().click();
  await expect(eaten(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(eaten(page)).toHaveCount(2);
  await page.reload();
  await nutrition(page);
  await expect(eaten(page)).toHaveCount(2);
  await noViolations(page);
});

test('a bad number is refused with the limit stated and nothing is added', async ({ page }) => {
  await nutrition(page);
  const sheet = await oneOff(page);
  await addFood(sheet, 'Feast', 20000, 10);
  await expect(sheet.getByRole('alert')).toContainText('1 to 9,999');
  await closeSheet(page);
  await expect(eaten(page)).toHaveCount(0);
});

test('Ate this logs a recipe with macros as a snapshot, Undo takes it back, and a recipe without macros asks for them', async ({ page }) => {
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await startRecipe(page);
  await page.getByLabel('Name', { exact: true }).fill('Chili');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('beans');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByText('Add calories and protein per serving to log this recipe.')).toBeVisible();
  await page.getByRole('button', { name: 'Add them' }).click();
  await page.getByRole('button', { name: 'Edit nutrition per serving' }).click();
  await page.getByLabel('Calories per serving').fill('600');
  await page.getByLabel('Protein per serving (g)').fill('40');
  await page.getByLabel('Carbs per serving (g), optional').fill('51');
  await page.getByLabel('Fat per serving (g), optional').fill('11');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByText('Per portion: 600 kcal · P 40 · C 51 · F 11 g')).toBeVisible();
  await page.getByRole('button', { name: 'More', exact: true }).click(); // 1.5 servings: 900 kcal, 60 g
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.getByText('Logged 1.5 portions to today.')).toBeVisible();
  await nutrition(page);
  await expect(eaten(page)).toContainText('Chili');
  await expect(eaten(page)).toContainText('900 kcal');
  await expect(eaten(page)).toContainText('C 76.5 · F 16.5 g');
  // editing the recipe afterwards does not change what was logged
  await page.click('#daily-recipes');
  await page.locator('.rc-row', { hasText: /Chili/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Edit nutrition per serving' }).click();
  await page.getByLabel('Calories per serving').fill('100');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await nutrition(page);
  await expect(eaten(page)).toContainText('900 kcal');
  // Undo right after logging removes just that entry
  await page.click('#daily-recipes');
  await page.locator('.rc-row', { hasText: /Chili/ }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await nutrition(page);
  await expect(eaten(page)).toHaveCount(1);
});

test('the food log follows the board: today is a separate day from yesterday (read-only, last week) and from a day ahead (no eaten list)', async ({ page }) => {
  await nutrition(page);
  const sheet = await oneOff(page);
  await addFood(sheet, 'Toast', 90, 3);
  await closeSheet(page);
  await expect(page.locator('.nb-target')).toContainText('Adding to Thu 24 · today');
  await expect(eaten(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Fri 25, add food here' }).click(); // a day ahead: food is planned, not eaten, so no Eaten list
  await expect(page.locator('.nb-target')).toContainText('Adding to Fri 25');
  await expect(page.locator('.nb-col[data-day="2026-09-25"] .nb-eat')).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous week' }).click();
  const yesterday = page.locator('.nb-col[data-day="2026-09-23"]');
  await expect(yesterday.locator('.nb-eat')).toHaveCount(0);
  await expect(page.locator('.nb-target')).toContainText('food is read-only'); // and nothing can be added to it
  await expect(page.locator('#nb-add')).toHaveCount(0);
  await page.getByRole('button', { name: 'This week' }).click();
  await expect(eaten(page)).toHaveCount(1);
  await expect(page.locator('.nb-target')).toContainText('Adding to Thu 24 · today');
});

test('the Nutrition screen is the week board with Targets and goal and Manage in its header; Supplements and Hydration sit inside each day and there is no second date bar', async ({ page }) => {
  await nutrition(page);
  const y = async loc => (await loc.boundingBox()).y;
  await expect(todayCol(page).getByRole('group', { name: 'Supplements' })).toBeVisible(); // the Supplements section (the meter above it has the same word)
  await expect(todayCol(page).getByText('Hydration', { exact: true })).toBeVisible();
  await expect(page.locator('#diet-h')).toHaveCount(0); // the Targets block is no longer under the board
  expect(await y(page.locator('#nb-targets'))).toBeLessThan(await y(todayCol(page)));
  await expect(page.locator('.weekbar')).toHaveCount(0);
  await openTargets(page);
  await expect(diet(page).getByRole('button', { name: /Day before|Day after|Previous day|Next day/ })).toHaveCount(0); // no day selector inside Targets and goal
});

test('an entry without carbs and fat still logs, and the log says carbs and fat count only what was entered', async ({ page }) => {
  await nutrition(page);
  const sheet = await oneOff(page);
  await addFood(sheet, 'Toast', 90, 3);
  await closeSheet(page);
  await expect(eaten(page)).toContainText('90 kcal · P 3 g');
  await expect(todayCol(page)).toContainText('Carbs and fat count only what you enter.');
});
