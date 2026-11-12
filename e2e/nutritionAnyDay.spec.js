import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Brief nutrition-any-day-add: tap a day's column to add to that day. The day-to-log rule (an earlier day and today log, a day ahead plans) is a node test (src/lib/nutritionBoard.test.ts); this covers the wiring.
// The fixed clock is Thursday 2026-09-24, 18:30.
const TUE = '2026-09-22', MON = '2026-09-21';
const col = (page, day) => page.locator(`.nb-col[data-day="${day}"]`);
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:diet/main') || '{}').items || []);
const seedDiet = async (page, items) => { await page.evaluate(l => localStorage.setItem('ironlog:diet/main', JSON.stringify({ items: l })), items); await page.reload(); };

test('tap a past day, add a one-off food: it logs on that date, shows in that column, and the address stays put', async ({ page }) => {
  await openNutrition(page);
  const url = page.url();
  await col(page, TUE).getByRole('button', { name: /^Tue 22/ }).click();
  await expect(page.locator('.nb-target')).toHaveText('Adding to Tue 22');
  const sheet = await openAdd(page, 'One-off food');
  await expect(sheet).toContainText('logs food you ate that day');
  await sheet.locator('#dt-add-n').fill('Toast');
  await sheet.locator('#dt-add-k').fill('90');
  await sheet.locator('#dt-add-p').fill('3');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet.getByRole('status').last()).toContainText('Added Toast.');
  await closeSheet(page);
  await expect(col(page, TUE).locator('.nb-eat')).toContainText('Toast');
  await expect(todayCol(page).locator('.nb-eat')).toHaveCount(0);
  expect((await stored(page)).map(e => [e.d, e.n])).toEqual([[TUE, 'Toast']]);
  expect(page.url()).toBe(url);
  await page.reload();
  await openNutrition(page);
  await expect(page.locator('.nb-target')).toHaveText('Adding to Thu 24 · today'); // a reload shows today
});

test('a past day offers the log ways, and Copy yesterday there says one sentence', async ({ page }) => {
  await seedDiet(page, [{ id: 'p1', d: MON, n: 'Pasta', kcal: 500, p: 20 }]);
  await openNutrition(page);
  await col(page, TUE).getByRole('button', { name: /^Tue 22/ }).click();
  const bar = page.locator('.nb-toolbar');
  for (const f of ['Scan barcode', 'Quick add', 'One-off food']) await expect(bar.getByRole('button', { name: f, exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Recipes', exact: true })).toHaveCount(0);
  const sheet = await openAdd(page, 'Copy yesterday');
  await sheet.getByRole('button', { name: /^Copy / }).click();
  await sheet.getByRole('button', { name: 'Add selected' }).click();
  await expect(sheet.getByRole('status').last()).toHaveText('Added 1.');
  await closeSheet(page);
  await expect(col(page, TUE).locator('.nb-eat')).toContainText('Pasta');
  expect((await stored(page)).filter(e => e.d === TUE)).toHaveLength(1);
});

test('a day ahead still offers only Saved meals and Recipes (plan items)', async ({ page }) => {
  await openNutrition(page);
  await col(page, '2026-09-26').getByRole('button', { name: /^Sat 26/ }).click();
  const sheet = await openAdd(page);
  await expect(sheet.getByRole('button', { name: /^(Quick add|One-off food|Scan barcode|Find food|Copy)/ })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: /^Recipes/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Saved meals/ })).toBeVisible();
});
