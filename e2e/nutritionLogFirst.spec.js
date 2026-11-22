import { test, expect } from './fixtures.js';
import { closeSheet, moveCard, openAdd, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Log first, portion on the row (brief nutrition-log-first-portion-row, PR b). The rules (which rows step, where a step lands, the usual a step saves, what a one-tap log writes) are node tests
// (eatenStep.test.ts, logAtUsual.test.ts, usualPortion.test.ts, portionBasis.test.ts); this covers the wiring: one tap logs and the sheet stays open, Undo, Less and More on the row and on a ticked plan card, the usual saved, the row's name still opening its sheet.
// The fixed clock is Thursday 2026-09-24, 18:30 (Dinner).
const TODAY = '2026-09-24', TUE = '2026-09-22', TOMORROW = '2026-09-25';
const col = (page, day) => page.locator(`.nb-col[data-day="${day}"]`);
const mk = (id, n, kcal, p, extra = {}) => ({ id, n, cat: 'other', ing: [{ n: 'x' }], steps: ['Cook.'], kcal, p, ...extra });
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:diet/main') || '{}').items || []);
const storedRecipes = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:recipes/main') || '{}').items || []);
const seed = async (page, recipes, diet) => {
  await page.evaluate(([r, d]) => { localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: r })); localStorage.setItem('ironlog:diet/main', JSON.stringify({ items: d })); }, [recipes, diet]);
  await page.reload();
};
const OATS = mk('o1', 'Oats', 300, 10);
const row = (page, name, day = TODAY) => col(page, day).locator('.nb-eat', { hasText: name });
const calories = (page, day = TODAY) => col(page, day).getByRole('img', { name: /^Calories / });

test.describe('one tap logs at the usual portion', () => {
  test('Quick add: the chip logs at the usual, the sheet stays open, and Undo removes exactly that entry', async ({ page }) => {
    await seed(page, [{ ...OATS, usual: 1.5 }], [{ id: 'old', d: TUE, n: 'Oats', kcal: 300, p: 10, from: 'o1' }, { id: 'k1', d: TODAY, n: 'Kept', kcal: 100, p: 5 }]);
    await openNutrition(page);
    const sheet = await openAdd(page, 'Quick add');
    await sheet.getByRole('list', { name: 'Recent and favorites' }).getByRole('button', { name: 'Oats' }).click();
    await expect(sheet).toBeVisible(); // the sheet stays open: no portion sheet in between
    await expect(sheet.getByRole('status').last()).toContainText('Logged Oats, 1.5 portions.');
    await expect(sheet.getByRole('list', { name: 'Recent and favorites' })).toBeVisible(); // so another food can be added
    expect((await stored(page)).filter(e => e.d === TODAY).map(e => [e.n, e.kcal, e.x])).toEqual([['Kept', 100, undefined], ['Oats', 450, 1.5]]);
    await sheet.getByRole('button', { name: 'Undo' }).click();
    expect((await stored(page)).filter(e => e.d === TODAY).map(e => e.n)).toEqual(['Kept']); // only the entry this tap made
    await expect(sheet.getByRole('status').last()).toHaveText('Undone.');
  });

  test('Log in the Recipes way logs at once at one portion, and the sentence is the same', async ({ page }) => {
    await seed(page, [OATS, mk('c1', 'Chili', 400, 30)], []);
    await openNutrition(page);
    const sheet = await openAdd(page, 'Recipes');
    await sheet.getByLabel('Find a recipe').fill('Chili');
    await sheet.getByRole('button', { name: 'Log Chili' }).click();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('status').last()).toContainText('Logged Chili, 1 portion.');
    expect((await stored(page)).map(e => [e.n, e.kcal, e.from])).toEqual([['Chili', 400, 'c1']]);
    await closeSheet(page);
    await expect(row(page, 'Chili')).toContainText('Less');
  });

  test('Find food: a recipe match and a food with no recipe both log at once, and Undo takes the last one back', async ({ page }) => {
    await seed(page, [OATS], [{ id: 'p1', d: TUE, n: 'Toast', kcal: 90, p: 3 }]);
    await openNutrition(page);
    const sheet = await openAdd(page, 'Find food');
    await sheet.getByLabel('Search your past meals and recipes').fill('Toast');
    await sheet.getByRole('list', { name: 'Matches' }).getByRole('button').first().click();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('status').last()).toContainText('Logged Toast, 1 portion.');
    expect((await stored(page)).filter(e => e.d === TODAY).map(e => [e.n, e.x])).toEqual([['Toast', 1]]);
    await sheet.getByLabel('Search your past meals and recipes').fill('Oats');
    await sheet.getByRole('list', { name: 'Matches' }).getByRole('button').first().click();
    await expect(sheet.getByRole('status').last()).toContainText('Logged Oats, 1 portion.');
    await sheet.getByRole('button', { name: 'Undo' }).click();
    expect((await stored(page)).filter(e => e.d === TODAY).map(e => e.n)).toEqual(['Toast']);
  });

  test('a day ahead still plans: Recipes there has Plan and no Log', async ({ page }) => {
    await seed(page, [OATS], []);
    await openNutrition(page);
    await col(page, TOMORROW).locator('.nb-dayname').click();
    const sheet = await openAdd(page, 'Recipes');
    await expect(sheet.getByRole('button', { name: /^Plan Oats/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Log Oats/ })).toHaveCount(0);
  });

  test('a full day refuses with the same sentence and logs nothing', async ({ page }) => {
    const full = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, d: TODAY, n: `Food ${i}`, kcal: 10, p: 1 }));
    await seed(page, [OATS], full);
    await openNutrition(page);
    const sheet = await openAdd(page, 'Recipes');
    await sheet.getByRole('button', { name: 'Log Oats' }).click();
    await expect(sheet.getByRole('status').last()).toContainText('20');
    expect((await stored(page)).length).toBe(20);
  });
});

test.describe('Less and More on an eaten row', () => {
  test('a tap changes the row, the meal and the day bars; a food with no recipe reads x 1.5', async ({ page }) => {
    await seed(page, [OATS], [{ id: 'a', d: TODAY, n: 'Oats', kcal: 450, p: 15, from: 'o1', x: 1.5, t: 18 }, { id: 'b', d: TODAY, n: 'Toast', kcal: 135, p: 4, x: 1.5, t: 18 }]);
    await openNutrition(page);
    await expect(row(page, 'Oats').locator('.nb-stepamt')).toHaveText('1.5 portions');
    await expect(row(page, 'Toast').locator('.nb-stepamt')).toHaveText('x 1.5');
    await expect(calories(page)).toHaveAttribute('aria-label', /: 585 /);
    await row(page, 'Oats').getByRole('button', { name: 'Less Oats' }).click();
    await expect(row(page, 'Oats').locator('.nb-stepamt')).toHaveText('1 portion');
    await expect(row(page, 'Oats')).toContainText('300 kcal');
    await expect(calories(page)).toHaveAttribute('aria-label', /: 435 /);
    await expect(col(page, TODAY).locator('.wb-slothd', { hasText: 'Dinner' })).toContainText('435 kcal'); // the meal's own line (both rows were eaten at 18:00: Dinner)
    await row(page, 'Toast').getByRole('button', { name: 'More Toast' }).click();
    await expect(row(page, 'Toast').locator('.nb-stepamt')).toHaveText('x 2');
    expect((await stored(page)).map(e => [e.n, e.kcal, e.x])).toEqual([['Oats', 300, 1], ['Toast', 180, 2]]);
  });

  test('the stepper is its own full-width line under the name: Less left, amount centred, More right', async ({ page }) => {
    await seed(page, [OATS], [{ id: 'a', d: TODAY, n: 'Oats', kcal: 450, p: 15, from: 'o1', x: 1.5 }]);
    await openNutrition(page);
    const r = row(page, 'Oats');
    const [name, less, amt, more, line] = await Promise.all([r.locator('.nb-eatrow'), r.getByRole('button', { name: 'Less Oats' }), r.locator('.nb-stepamt'), r.getByRole('button', { name: 'More Oats' }), r.locator('.nb-step')].map(l => l.boundingBox()));
    expect(line.y).toBeGreaterThanOrEqual(name.y + name.height - 1); // under the name's line, not at its right end
    expect(Math.abs(line.width - name.width)).toBeLessThan(2); // full width
    expect(less.x).toBeLessThan(amt.x);
    expect(amt.x + amt.width).toBeLessThanOrEqual(more.x + 1);
    expect(Math.abs(amt.x + amt.width / 2 - (line.x + line.width / 2))).toBeLessThan(6); // centred
  });

  test('Less is disabled at half a portion', async ({ page }) => {
    await seed(page, [OATS], [{ id: 'a', d: TODAY, n: 'Oats', kcal: 150, p: 5, from: 'o1', x: 0.5 }]);
    await openNutrition(page);
    await expect(row(page, 'Oats').getByRole('button', { name: 'Less Oats' })).toBeDisabled();
    await expect(row(page, 'Oats').getByRole('button', { name: 'More Oats' })).toBeEnabled();
  });

  test('More is disabled where the totals stop fitting one entry', async ({ page }) => {
    await seed(page, [], [{ id: 'a', d: TODAY, n: 'Feast', kcal: 9000, p: 10, x: 1.5 }]);
    await openNutrition(page);
    await expect(row(page, 'Feast').getByRole('button', { name: 'More Feast' })).toBeDisabled();
  });

  test('on a food logged today from a recipe a nudge offers Save as my usual (the nudge itself saves none), with the notice and an Undo; an earlier day offers nothing', async ({ page }) => {
    await seed(page, [OATS], [{ id: 'a', d: TODAY, n: 'Oats', kcal: 300, p: 10, from: 'o1', x: 1 }, { id: 'b', d: TUE, n: 'Oats', kcal: 300, p: 10, from: 'o1', x: 1 }]);
    await openNutrition(page);
    await row(page, 'Oats').getByRole('button', { name: 'More Oats' }).click();
    const status = page.locator('.nb-msg');
    await expect(status).toContainText('Oats, 1.5 portions.');
    expect((await storedRecipes(page))[0].usual).toBeUndefined(); // the nudge changed the entry only
    await status.getByRole('button', { name: 'Save 1.5 portions as my usual' }).click();
    await expect(status).toContainText('Usual portion saved: Oats, 1.5 portions.');
    await expect.poll(async () => (await storedRecipes(page))[0].usual).toBe(1.5);
    await status.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await storedRecipes(page))[0].usual).toBeUndefined();
    await expect(row(page, 'Oats').locator('.nb-stepamt')).toHaveText('1.5 portions'); // Undo takes back the usual, not the eaten amount
    await row(page, 'Oats', TUE).getByRole('button', { name: 'More Oats' }).click(); // an earlier day
    await expect(row(page, 'Oats', TUE).locator('.nb-stepamt')).toHaveText('1.5 portions');
    expect((await storedRecipes(page))[0].usual).toBeUndefined();
    await expect(status.getByRole('button', { name: /as my usual/ })).toHaveCount(0);
    await expect(status).not.toContainText('Usual portion saved');
  });

  test('the name still opens the row sheet, and Less and More are separate buttons', async ({ page }) => {
    await seed(page, [OATS], [{ id: 'a', d: TODAY, n: 'Oats', kcal: 300, p: 10, from: 'o1', x: 1 }]);
    await openNutrition(page);
    await row(page, 'Oats').locator('.nb-eatrow').click();
    const sheet = page.getByRole('dialog');
    for (const b of ['Copy to…', 'Move to…', 'Edit', 'Delete Oats']) await expect(sheet.getByRole('button', { name: b })).toBeVisible();
  });
});

test.describe('a ticked planned recipe card', () => {
  test('Less and More change the plan portion and its logged entry together', async ({ page }) => {
    await seed(page, [mk('c1', 'Chili', 400, 30)], []);
    await openNutrition(page);
    await col(page, TOMORROW).locator('.nb-dayname').click();
    const sheet = await openAdd(page, 'Recipes');
    await sheet.getByRole('group', { name: 'Which meal' }).getByRole('button', { name: 'Dinner', exact: true }).click();
    await sheet.getByRole('button', { name: 'Plan Chili for Dinner' }).click();
    await closeSheet(page);
    await moveCard(page, col(page, TOMORROW), 'Chili', { day: 'Thu 24 · today' });
    await todayCol(page).getByRole('checkbox', { name: 'Check Chili as eaten' }).click();
    await todayCol(page).getByRole('button', { name: 'More Chili' }).click();
    await expect(todayCol(page).locator('.wb-card', { hasText: 'Chili' })).toContainText('× 1.5');
    await expect(calories(page)).toHaveAttribute('aria-label', /: 600 /);
    await expect.poll(async () => (await stored(page)).map(e => [e.n, e.kcal, e.x])).toEqual([['Chili', 600, 1.5]]);
    await todayCol(page).getByRole('button', { name: 'Less Chili' }).click();
    await todayCol(page).getByRole('button', { name: 'Less Chili' }).click();
    await expect(todayCol(page).getByRole('button', { name: 'Less Chili' })).toBeDisabled(); // half a portion
    await expect.poll(async () => (await stored(page)).map(e => [e.kcal, e.x])).toEqual([[200, 0.5]]);
  });
});
