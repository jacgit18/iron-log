import { test, expect } from './fixtures.js';
import { openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Brief nutrition-move-copy-eaten: the eaten row sheet's Move to and Copy to. The rule (day rules, the hour and numbers that carry, no entry lost or twice) is a node test
// (src/lib/moveCopyEaten.test.ts); this covers the wiring: the pickers, the one sentence, Undo, the 20 a day limit. The fixed clock is Thursday 2026-09-24, 18:30.
const TODAY = '2026-09-24';
const YESTERDAY = '2026-09-23';
const seedDiet = async (page, items) => { await page.evaluate(l => localStorage.setItem('ironlog:diet/main', JSON.stringify({ items: l })), items); await page.reload(); };
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:diet/main') || '{}').items || []);
const ENTRIES = [
  { id: 'soup', d: TODAY, n: 'Soup', kcal: 200, p: 10, c: 20, f: 5, t: 12, micro: { calcium: 100 } },
  { id: 'old', d: YESTERDAY, n: 'Pasta', kcal: 500, p: 20 },
];
const open = (page, name, day = TODAY) => page.locator(`.nb-col[data-day="${day}"] .nb-eatrow`, { hasText: name }).first().click();
const sheet = page => page.getByRole('dialog');

test('Copy to day adds the same food on that day with its numbers and hour; the original stays; one sentence', async ({ page }) => {
  await seedDiet(page, ENTRIES);
  await openNutrition(page);
  await open(page, 'Soup');
  await sheet(page).getByRole('button', { name: 'Copy to…' }).click();
  await expect(sheet(page).getByRole('group', { name: 'Copy to day' }).getByRole('button', { name: /today$/ })).toHaveCount(0); // not its own day
  await sheet(page).getByRole('group', { name: 'Copy to day' }).getByRole('button', { name: /^Tue 22/ }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator('.nb-msg')).toHaveText('Added 1 from Soup.');
  const all = await stored(page);
  expect(all).toHaveLength(3);
  expect(all.find(e => e.id === 'soup')).toMatchObject({ d: TODAY, n: 'Soup' });
  expect(all.find(e => e.id !== 'soup' && e.n === 'Soup')).toMatchObject({ d: '2026-09-22', kcal: 200, p: 10, c: 20, f: 5, t: 12, micro: { calcium: 100 } });
  await expect(page.locator('.nb-col[data-day="2026-09-22"] .nb-eat')).toContainText('Soup');
});

test('Move to day removes the original, says so, and Undo puts it back with no copy left', async ({ page }) => {
  await seedDiet(page, ENTRIES);
  await openNutrition(page);
  await open(page, 'Soup');
  await sheet(page).getByRole('button', { name: 'Move to…' }).click();
  await sheet(page).getByRole('group', { name: 'Move to day' }).getByRole('button', { name: /^Wed 23/ }).click();
  await expect(page.locator('.nb-msg')).toHaveText('Moved 1 from Soup.');
  await expect(todayCol(page).locator('.nb-eat')).toHaveCount(0);
  await expect(page.locator(`.nb-col[data-day="${YESTERDAY}"] .nb-eat`)).toHaveCount(2);
  expect((await stored(page)).filter(e => e.n === 'Soup').map(e => e.d)).toEqual([YESTERDAY]);
  await page.getByRole('button', { name: 'Undo' }).click();
  const all = await stored(page);
  expect(all.filter(e => e.n === 'Soup')).toEqual([ENTRIES[0]]); // back as it was, nothing duplicated
  await expect(todayCol(page).locator('.nb-eat')).toHaveCount(1);
});

test('an earlier day can move or copy food to today, where the hour puts it in its meal', async ({ page }) => {
  await seedDiet(page, [{ ...ENTRIES[1], t: 8 }]);
  await openNutrition(page);
  await open(page, 'Pasta', YESTERDAY);
  await sheet(page).getByRole('button', { name: 'Copy to…' }).click();
  await sheet(page).getByRole('group', { name: 'Copy to day' }).getByRole('button', { name: /today$/ }).click();
  await expect(todayCol(page).locator('.wb-slot', { has: page.locator('.wb-slothd b', { hasText: /^Breakfast$/ }) }).locator('.nb-eat')).toContainText('Pasta');
});

test('a full target day: the store sentence, nothing moves', async ({ page }) => {
  const full = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, d: YESTERDAY, n: `Food ${i}`, kcal: 100, p: 1 }));
  await seedDiet(page, [ENTRIES[0], ...full]);
  await openNutrition(page);
  await open(page, 'Soup');
  await sheet(page).getByRole('button', { name: 'Move to…' }).click();
  await sheet(page).getByRole('group', { name: 'Move to day' }).getByRole('button', { name: /^Wed 23/ }).click();
  await expect(page.locator('.nb-msg')).toHaveText('Moved 0 from Soup. You can log 20 things a day.');
  expect(await stored(page)).toHaveLength(21);
  await expect(todayCol(page).locator('.nb-eat')).toHaveCount(1);
});

test('the pickers list past days and today only, never a day ahead', async ({ page }) => {
  await seedDiet(page, ENTRIES);
  await openNutrition(page);
  await open(page, 'Pasta', YESTERDAY);
  await sheet(page).getByRole('button', { name: 'Move to…' }).click();
  const labels = await sheet(page).getByRole('group', { name: 'Move to day' }).getByRole('button').allTextContents();
  expect(labels).toContain('Thu 24 · today');
  expect(labels).not.toContain('Wed 23');
  expect(labels.some(l => /^(Fri 25|Sat 26|Sun 27)/.test(l))).toBe(false);
});
