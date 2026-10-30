import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Diet inside Nutrition (ADR 086), the first box on that screen: the daily calorie, protein, carbs and fat targets, and a food log a day at a time. The rules (the target numbers, totals,
// caps) are node tests (dietTarget, dietLog, shared/diet, dietSlice); this covers the wiring: the card, typing a target, quick add, "Ate this" on
// a recipe, Undo, the Nutrition date bar driving Diet's day, and that it all survives a reload. Syncing a second device is covered by e2e:sync, not here.
const seedBody = (page, goal, weight) => page.addInitScript(([g, w]) => {
  if (localStorage.getItem('ironlog:config/main')) return; // seed once: the script runs again on every reload and would wipe what the test saved
  localStorage.setItem('ironlog:config/main', JSON.stringify({ bwGoal: { w: g } }));
  localStorage.setItem('ironlog:body/main', JSON.stringify({ schema: 1, entries: [{ wk: '2026-09-20', d: '2026-09-21', w }] }));
}, [goal, weight]);
const diet = page => page.getByRole('region', { name: 'Diet' });
const nutrition = async page => { await page.click('#tab-daily'); await page.click('#daily-supplements'); };
const noViolations = async page => {
  const { violations } = await new AxeBuilder({ page }).include('#diet-h').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
};

test('Diet is on Nutrition for everyone; with no goal weight it asks for one and still lets you type a target', async ({ page }) => {
  await nutrition(page);
  await expect(diet(page).getByRole('heading', { name: 'Diet' })).toBeVisible();
  await expect(diet(page)).toContainText('Set a goal weight under Progress');
  await expect(diet(page)).toContainText('Nothing logged yet');
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
  await diet(page).getByLabel('Food').fill('Rice');
  await diet(page).getByLabel('Calories', { exact: true }).last().fill('200');
  await diet(page).getByLabel('Protein (g)').last().fill('4');
  await page.locator('#dt-add-c').fill('44');
  await page.locator('#dt-add-f').fill('0.5');
  await diet(page).getByRole('button', { name: 'Add', exact: true }).click();
  await expect(diet(page).locator('.dt-entry')).toContainText('Rice');
  await expect(diet(page).locator('.dt-entry')).toContainText('44 g carbs · 0.5 g fat');
  await expect(diet(page).getByRole('progressbar', { name: /Calories 200 of 2,800 kcal/ })).toBeVisible();
  await expect(diet(page).getByRole('progressbar', { name: /Protein 4 of 150 g/ })).toBeVisible();
  await expect(diet(page).getByRole('progressbar', { name: /Carbs 44 of 370 g/ })).toBeVisible();
  await expect(diet(page).getByRole('progressbar', { name: /Fat 0.5 of 80 g/ })).toBeVisible();
  await diet(page).getByRole('button', { name: 'Rice · 200 kcal' }).click(); // offered again in one tap
  await expect(diet(page).locator('.dt-entry')).toHaveCount(2);
  await diet(page).getByRole('button', { name: 'Delete Rice' }).first().click();
  await expect(diet(page).locator('.dt-entry')).toHaveCount(1);
  await diet(page).getByRole('button', { name: 'Undo' }).click();
  await expect(diet(page).locator('.dt-entry')).toHaveCount(2);
  await page.reload();
  await nutrition(page);
  await expect(diet(page).locator('.dt-entry')).toHaveCount(2);
  await noViolations(page);
});

test('a bad number is refused with the limit stated and nothing is added', async ({ page }) => {
  await nutrition(page);
  await diet(page).getByLabel('Food').fill('Feast');
  await diet(page).getByLabel('Calories', { exact: true }).last().fill('20000');
  await diet(page).getByLabel('Protein (g)').last().fill('10');
  await diet(page).getByRole('button', { name: 'Add', exact: true }).click();
  await expect(diet(page).getByRole('alert')).toContainText('1 to 9,999');
  await expect(diet(page).locator('.dt-entry')).toHaveCount(0);
});

test('Ate this logs a recipe with macros as a snapshot, Undo takes it back, and a recipe without macros asks for them', async ({ page }) => {
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Chili');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('beans');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByText('Add calories and protein per serving to log this recipe.')).toBeVisible();
  await page.getByRole('button', { name: 'Add them' }).click();
  await page.getByLabel('Calories per serving').fill('600');
  await page.getByLabel('Protein per serving (g)').fill('40');
  await page.getByLabel('Carbs per serving (g), optional').fill('51');
  await page.getByLabel('Fat per serving (g), optional').fill('11');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByText('Per serving: 600 kcal · 40 g protein · 51 g carbs · 11 g fat')).toBeVisible();
  await page.getByRole('button', { name: 'More', exact: true }).click(); // 1.5 servings: 900 kcal, 60 g
  await page.getByRole('button', { name: 'Ate this' }).click();
  await expect(page.getByText('Logged 1.5 servings of Chili to today.')).toBeVisible();
  await nutrition(page);
  await expect(diet(page).locator('.dt-entry')).toContainText('Chili');
  await expect(diet(page).locator('.dt-entry')).toContainText('900 kcal');
  await expect(diet(page).locator('.dt-entry')).toContainText('76.5 g carbs · 16.5 g fat');
  // editing the recipe afterwards does not change what was logged
  await page.click('#daily-recipes');
  await page.getByRole('button', { name: /Chili/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Calories per serving').fill('100');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await nutrition(page);
  await expect(diet(page).locator('.dt-entry')).toContainText('900 kcal');
  // Undo right after logging removes just that entry
  await page.click('#daily-recipes');
  await page.getByRole('button', { name: /Chili/ }).click();
  await page.getByRole('button', { name: 'Ate this' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await nutrition(page);
  await expect(diet(page).locator('.dt-entry')).toHaveCount(1);
});

test('Diet follows the Nutrition date bar: yesterday is a separate day, and the bar cannot go past today', async ({ page }) => {
  await nutrition(page);
  await diet(page).getByLabel('Food').fill('Toast');
  await diet(page).getByLabel('Calories', { exact: true }).last().fill('90');
  await diet(page).getByLabel('Protein (g)').last().fill('3');
  await diet(page).getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled();
  await expect(diet(page)).toContainText('Food eaten · Today');
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(diet(page).locator('.dt-entry')).toHaveCount(0);
  await expect(diet(page)).toContainText('Food eaten · Wednesday 09/23');
  await expect(page.locator('.weekbar')).toContainText('Wednesday');
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(diet(page).locator('.dt-entry')).toHaveCount(1);
  await expect(diet(page)).toContainText('Food eaten · Today');
});

test('the Nutrition screen reads date bar, Diet, Supplements, Water: Diet comes before Supplements and Water and shares the one date bar', async ({ page }) => {
  await nutrition(page);
  const y = async loc => (await loc.boundingBox()).y;
  const dietY = await y(page.locator('#diet-h'));
  await expect(page.getByRole('heading', { name: 'Supplements' })).toBeVisible();
  expect(await y(page.locator('.weekbar'))).toBeLessThan(dietY);
  expect(dietY).toBeLessThan(await y(page.getByRole('heading', { name: 'Supplements' })));
  expect(dietY).toBeLessThan(await y(page.locator('#water-h')));
  await expect(diet(page).getByRole('button', { name: /Day before|Day after/ })).toHaveCount(0); // no second day selector inside Diet
});

test('an entry without carbs and fat still logs, and the log says carbs and fat count only what was entered', async ({ page }) => {
  await nutrition(page);
  await diet(page).getByLabel('Food').fill('Toast');
  await diet(page).getByLabel('Calories', { exact: true }).last().fill('90');
  await diet(page).getByLabel('Protein (g)').last().fill('3');
  await diet(page).getByRole('button', { name: 'Add', exact: true }).click();
  await expect(diet(page).locator('.dt-entry')).toContainText('90 kcal · 3 g protein');
  await expect(diet(page)).toContainText('Carbs and fat count only what you enter.');
});
