import { test, expect } from './fixtures.js';
import { openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Brief nutrition-items-row-sheet-and-more: an Add supplement button in the Supplements section. Which supplements the picker offers is a node test (src/lib/nutritionBoard.test.ts); this covers the taps. The fixed clock is Thursday 2026-09-24.
const seedSupps = async (page, items) => {
  await page.evaluate(l => localStorage.setItem('ironlog:supplements/main', JSON.stringify({ waterGoal: 64, waterMode: 'weight', water: {}, boost: {}, taken: {}, items: l })), items);
  await page.reload();
};
const takenToday = page => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ironlog:supplements/main') || '{}').taken?.['2026-09-24'] ?? {}));

test('Add supplement, pick one: it is ticked for the day in two taps', async ({ page }) => {
  await seedSupps(page, [{ id: 'creatine', n: 'Creatine', slot: 'morning', dose: '5 g' }, { id: 'magnesium', n: 'Magnesium', slot: '', dose: '400 mg' }]);
  await openNutrition(page);
  let taps = 0;
  await todayCol(page).getByRole('button', { name: /^Add supplement/ }).click(); taps++;
  const sheet = page.getByRole('dialog', { name: /^Add supplement/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Creatine/ })).toHaveCount(0); // it already has a time of day and its own tick
  await sheet.getByRole('button', { name: /^Magnesium/ }).click(); taps++;
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(taps).toBeLessThanOrEqual(3);
  await expect(todayCol(page).getByRole('checkbox', { name: /Magnesium/ })).toBeChecked();
  await expect(todayCol(page).locator('.nb-supps .wb-slothd')).toContainText('1 of 2 taken');
  expect(await takenToday(page)).toEqual(['magnesium']);
});

test('with nothing to pick the sheet says so and points at Manage and the add sheet', async ({ page }) => {
  await seedSupps(page, []);
  await openNutrition(page);
  await todayCol(page).getByRole('button', { name: /^Add supplement/ }).click();
  const sheet = page.getByRole('dialog', { name: /^Add supplement/ });
  await expect(sheet).toContainText('No supplements yet.');
  await expect(sheet.getByRole('button', { name: '+ New supplement' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Manage', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Manage' })).toBeVisible();
});

test('unticking an "Also taken" supplement takes it off the day', async ({ page }) => {
  await seedSupps(page, [{ id: 'magnesium', n: 'Magnesium', slot: '', dose: '400 mg' }]);
  await openNutrition(page);
  await todayCol(page).getByRole('button', { name: /^Add supplement/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Magnesium/ }).click();
  await todayCol(page).getByRole('checkbox', { name: /Magnesium/ }).click();
  await expect(todayCol(page).getByRole('checkbox', { name: /Magnesium/ })).toHaveCount(0);
  expect(await takenToday(page)).toEqual([]);
});
