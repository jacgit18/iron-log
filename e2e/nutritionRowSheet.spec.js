import { test, expect } from './fixtures.js';
import { openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Brief nutrition-items-row-sheet-and-more: eaten food sits in its meal with an eaten mark (or in "Not in a meal"), and a row opens a sheet with Edit and a two-tap Delete. The rules (the hour that picks the meal, the meal totals) are node tests
// (src/lib/nutritionBoard.test.ts); this covers the wiring: where a row shows, the sheet, the two taps, an earlier day's rows, the kept day. The fixed clock is Thursday 2026-09-24, 18:30.
const TODAY = '2026-09-24';
const YESTERDAY = '2026-09-23';
const seedDiet = async (page, items) => { await page.evaluate(l => localStorage.setItem('ironlog:diet/main', JSON.stringify({ items: l })), items); await page.reload(); };
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:diet/main') || '{}').items || []);
const meal = (page, name) => todayCol(page).locator('.wb-slot').filter({ has: page.locator('.wb-slothd b', { hasText: new RegExp(`^${name}$`) }) });
const ENTRIES = [
  { id: 'tea', d: TODAY, n: 'Tea', kcal: 5, p: 0, t: 8 },
  { id: 'soup', d: TODAY, n: 'Soup', kcal: 200, p: 10, t: 12 },
  { id: 'toast', d: TODAY, n: 'Toast', kcal: 120, p: 4 },
  { id: 'old', d: YESTERDAY, n: 'Pasta', kcal: 500, p: 20, t: 19 },
];

test('there is no Eaten section: food sits in the meal for its hour, food with no hour in "Not in a meal"', async ({ page }) => {
  await seedDiet(page, ENTRIES);
  await openNutrition(page);
  await expect(page.locator('.wb-slothd b', { hasText: /^(Also eaten|Eaten)$/ })).toHaveCount(0);
  await expect(meal(page, 'Breakfast').locator('.nb-eat')).toContainText('Tea');
  await expect(meal(page, 'Breakfast').locator('.nb-eat')).toContainText('Eaten');
  await expect(meal(page, 'Lunch').locator('.nb-eat')).toContainText('Soup');
  await expect(meal(page, 'Not in a meal').locator('.nb-eat')).toContainText('Toast');
  await expect(todayCol(page).locator('.nb-eat')).toHaveCount(3); // nothing lost, nothing twice
  await expect(todayCol(page).getByRole('button', { name: /^(Edit|Delete) / })).toHaveCount(0); // no inline buttons on a row
});

test('tapping an eaten row opens a sheet: Edit saves a change, Delete needs two taps', async ({ page }) => {
  await seedDiet(page, ENTRIES);
  await openNutrition(page);
  await meal(page, 'Breakfast').getByRole('button', { name: /^Tea/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Tea' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('5 kcal');
  await sheet.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('dialog').locator('input[id$="-n"]').fill('Green tea');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Green tea' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await expect(meal(page, 'Breakfast').locator('.nb-eat')).toContainText('Green tea');
  await meal(page, 'Breakfast').getByRole('button', { name: /^Green tea/ }).click();
  const del = page.getByRole('dialog').getByRole('button', { name: 'Delete Green tea' });
  await del.click(); // first tap only arms it
  await expect(page.getByRole('dialog').getByRole('button', { name: /Tap again to delete/ })).toBeVisible();
  expect((await stored(page)).some(e => e.id === 'tea')).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: /Tap again to delete/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await stored(page)).map(e => e.id).sort()).toEqual(['old', 'soup', 'toast']); // only that entry went
  await expect(meal(page, 'Breakfast').locator('.nb-eat')).toHaveCount(0);
});

test('an earlier day lists its food in "Not in a meal"; a tap opens the same sheet, so Edit and Delete work there too', async ({ page }) => {
  await seedDiet(page, ENTRIES);
  await openNutrition(page);
  const past = page.locator(`.nb-col[data-day="${YESTERDAY}"]`);
  await expect(past.locator('.nb-eat')).toContainText('Pasta');
  await expect(past.locator('.wb-slothd b', { hasText: 'Not in a meal' })).toBeVisible();
  await past.locator('.nb-eatrow').click();
  const sheet = page.getByRole('dialog', { name: 'Pasta' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('dialog').locator('input[id$="-n"]').fill('Penne');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Penne' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await expect(past.locator('.nb-eat')).toContainText('Penne');
  await past.getByRole('button', { name: /^Penne/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete Penne' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Tap again to delete/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(past.locator('.nb-eat')).toHaveCount(0);
  expect((await stored(page)).map(e => e.id).sort()).toEqual(['soup', 'tea', 'toast']); // only that entry went
});

test('on a phone the row opens the same sheet', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await seedDiet(page, ENTRIES);
  await openNutrition(page);
  await page.locator('.nb-col.today .nb-eatrow', { hasText: 'Soup' }).click();
  await expect(page.getByRole('dialog', { name: 'Soup' })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Delete Soup' })).toBeVisible();
});

test('the day you picked is kept when you leave Nutrition and come back; a reload shows today; the address never holds it', async ({ page }) => {
  await openNutrition(page);
  await page.locator('.nb-col[data-day="2026-09-26"]').getByRole('button', { name: /^Sat 26/ }).click();
  await expect(page.locator('.nb-target')).toHaveText('Adding to Sat 26');
  await page.click('#daily-recipes');
  await expect(page.locator('#nb-h')).toHaveCount(0);
  await page.click('#daily-supplements');
  await expect(page.locator('.nb-target')).toHaveText('Adding to Sat 26');
  expect(await page.evaluate(() => location.hash)).not.toContain('26');
  await page.reload();
  await openNutrition(page);
  await expect(page.locator('.nb-target')).toHaveText('Adding to Thu 24 · today');
});
