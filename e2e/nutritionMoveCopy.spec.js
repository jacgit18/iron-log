import { test, expect } from './fixtures.js';
import { openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Brief nutrition-move-copy-eaten: the eaten row sheet's Move to and Copy to. The rule (day rules, the hour and numbers that carry, no entry lost or twice) is a node test
// (src/lib/moveCopyEaten.test.ts); this covers the wiring: the day picker (brief nutrition-multi-day-picker), the one sentence, Undo, the 20 a day limit. The fixed clock is Thursday 2026-09-24, 18:30.
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
// Ticks one day in the open sheet's picker by its name ("Tue 22", "Thu 24 · today"), then presses the Copy or Move button.
const pickDay = (page, verb, day, name) => sheet(page).getByRole('group', { name: `${verb} to day` }).getByRole('button', { name: day, exact: true }).click().then(() => sheet(page).getByRole('button', { name }).click());

test('Copy to day adds the same food on that day with its numbers and hour; the original stays; one sentence', async ({ page }) => {
  await seedDiet(page, ENTRIES);
  await openNutrition(page);
  await open(page, 'Soup');
  await sheet(page).getByRole('button', { name: 'Copy to…' }).click();
  await expect(sheet(page).getByRole('group', { name: 'Copy to day' }).getByRole('button', { name: /^Thu 24 · today/ })).toBeDisabled(); // not its own day
  await pickDay(page, 'Copy', 'Tue 22', 'Copy to Tue 22');
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator('.nb-msg')).toHaveText('Copied to Tue 22.');
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
  await pickDay(page, 'Move', 'Wed 23', 'Move to Wed 23');
  await expect(page.locator('.nb-msg')).toHaveText('Moved to Wed 23.');
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
  await pickDay(page, 'Copy', 'Thu 24 · today', 'Copy to Thu 24');
  await expect(todayCol(page).locator('.wb-slot', { has: page.locator('.wb-slothd b', { hasText: /^Breakfast$/ }) }).locator('.nb-eat')).toContainText('Pasta');
});

test('a full target day: the store sentence, nothing moves', async ({ page }) => {
  const full = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, d: YESTERDAY, n: `Food ${i}`, kcal: 100, p: 1 }));
  await seedDiet(page, [ENTRIES[0], ...full]);
  await openNutrition(page);
  await open(page, 'Soup');
  await sheet(page).getByRole('button', { name: 'Move to…' }).click();
  await pickDay(page, 'Move', 'Wed 23', 'Move to Wed 23');
  await expect(page.locator('.nb-msg')).toHaveText('Nothing moved. Skipped Wed 23: full.');
  expect(await stored(page)).toHaveLength(21);
  await expect(todayCol(page).locator('.nb-eat')).toHaveCount(1);
});

test('the picker greys a day ahead for an eaten one-off food and says why; its own day is greyed too', async ({ page }) => {
  await seedDiet(page, ENTRIES);
  await openNutrition(page);
  await open(page, 'Pasta', YESTERDAY);
  await sheet(page).getByRole('button', { name: 'Move to…' }).click();
  const g = sheet(page).getByRole('group', { name: 'Move to day' });
  await expect(g.getByRole('button', { name: /^Wed 23/ })).toBeDisabled();
  await expect(g.getByRole('button', { name: /^Thu 24 · today/ })).toBeEnabled();
  await g.getByRole('button', { name: 'Later week' }).click();
  await expect(g.getByRole('button', { name: /^Mon 28/ })).toBeDisabled();
});
