import { test, expect } from './fixtures.js';
import { openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Briefs ready-made-have-gate and nutrition-planned-available-tray: the Nutrition board no longer hides a ready-made food that Groceries says you Need; it flags it "Need to buy" (planned, it stays planned and counts; in the tray it carries the flag; either way its tick waits until Have). The rules (what hides, totals, repeats, handy rows) are node tests (src/lib/haveOnly.test.ts, weekBoard.test.ts, repeats.test.ts); this covers the wiring: the flag, the held tick, I have it, the tray, a tick on Groceries bringing it back, and what never hides.
// The fixed clock is Thursday 2026-09-24.
const food = (id, n, extra = {}) => ({ id, n, cat: 'ready', ing: [], steps: [], kcal: 100, p: 5, ...extra });
const item = (id, n) => ({ id, n, store: 'Anywhere', qty: 1, cents: null, every: false, out: false });
const seed = async page => {
  await page.evaluate(([recipes, items, plan]) => {
    localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: recipes }));
    localStorage.setItem('ironlog:grocery/main', JSON.stringify({ stores: ['Anywhere'], items }));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify({ lines: { oats: { have: true } }, pulled: [] }));
    const c = JSON.parse(localStorage.getItem('ironlog:config/main') || '{}');
    localStorage.setItem('ironlog:config/main', JSON.stringify({ ...c, diet: { plan: { '2026-09-24': plan } } }));
  }, [
    [food('oats', 'Oats'), food('yog', 'Greek yogurt'), food('dr', 'Dragon fruit'), { id: 'bowl', n: 'Yogurt bowl', cat: 'dinner', ing: [{ n: 'Greek yogurt' }], steps: ['Mix.'], kcal: 200, p: 10 }],
    [item('oats', 'Oats'), item('yog', 'Greek yogurt')],
    ['oats', 'yog', 'dr', 'bowl'].map(id => ({ k: 'r', id, s: 'snack', p: true })),
  ]);
  await page.reload();
};
const card = (page, name) => todayCol(page).locator('.wb-card', { hasText: name });

test('a planned Need ready-made food stays on the plate flagged Need to buy with its tick held; I have it clears it; recipes and no-match foods are not flagged', async ({ page }) => {
  await seed(page);
  await openNutrition(page);
  const yog = card(page, 'Greek yogurt');
  await expect(yog).toHaveCount(1);
  await expect(yog.locator('.wb-stock')).toHaveText('Need to buy');
  await expect(card(page, 'Oats').locator('.wb-stock')).toHaveText('Have');
  await expect(card(page, 'Dragon fruit').locator('.wb-stock')).toHaveCount(0); // matches nothing: never flagged
  await expect(card(page, 'Yogurt bowl').getByText('Need to buy')).toHaveCount(0); // a recipe with ingredients: never flagged
  await expect(todayCol(page).locator('.wb-slothd').filter({ hasText: 'Snack' })).toContainText('4 planned · 0 available'); // it still counts
  await expect(todayCol(page).getByRole('checkbox', { name: 'Check Greek yogurt as eaten' })).toBeDisabled();
  await expect(todayCol(page).getByText('On Shopping')).toHaveCount(1);
  await todayCol(page).getByRole('button', { name: 'I have Greek yogurt' }).click();
  await expect(yog.locator('.wb-stock')).toHaveText('Have');
  await expect(todayCol(page).getByRole('checkbox', { name: 'Check Greek yogurt as eaten' })).toBeEnabled();
});

test('an unplanned Need food sits in the tray with the same flag and a held Ate; Plan puts it on the plate, still flagged and counted', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('ironlog:config/main')); c.diet.plan['2026-09-24'] = c.diet.plan['2026-09-24'].map(i => (i.id === 'yog' ? { k: 'r', id: 'yog', s: 'snack' } : i)); localStorage.setItem('ironlog:config/main', JSON.stringify(c)); });
  await page.reload();
  await openNutrition(page);
  const snack = todayCol(page).locator('.wb-slot', { has: page.locator('.wb-slothd b', { hasText: /^Snack$/ }) });
  await expect(snack.locator('.wb-slothd')).toContainText('3 planned · 1 available');
  await snack.getByRole('button', { name: 'Available · 1 for Snack' }).click();
  await expect(snack.locator('.hy-row').getByText('Need to buy')).toBeVisible();
  await expect(snack.getByRole('button', { name: 'Ate Greek yogurt' })).toBeDisabled();
  await snack.getByRole('button', { name: 'Plan Greek yogurt' }).click();
  await expect(snack.locator('.wb-slothd')).toContainText('4 planned · 0 available');
  await expect(card(page, 'Greek yogurt').locator('.wb-stock')).toHaveText('Need to buy');
});

const seedAhead = async (page, extra = {}) => { // a day ahead: Lunch holds only a food that is Need, and a second Need food waits to be planned; `extra` plans more days
  await page.evaluate(([recipes, items, plan, more]) => {
    localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: recipes }));
    localStorage.setItem('ironlog:grocery/main', JSON.stringify({ stores: ['Anywhere'], items }));
    const c = JSON.parse(localStorage.getItem('ironlog:config/main') || '{}');
    localStorage.setItem('ironlog:config/main', JSON.stringify({ ...c, diet: { plan: { '2026-09-25': plan, ...more } } }));
  }, [[food('yog', 'Greek yogurt'), food('skyr', 'Skyr')], [item('yog', 'Greek yogurt'), item('skyr', 'Skyr')], [{ k: 'r', id: 'yog', s: 'lunch', p: true }], extra]);
  await page.reload();
};

test('a day-ahead meal that holds a flagged food keeps its header Add, and planning another Need food says it is flagged', async ({ page }) => {
  await seedAhead(page);
  await openNutrition(page);
  const fri = page.locator('.nb-col[data-day="2026-09-25"]');
  await expect(fri.getByRole('button', { name: /^Add to / })).toHaveCount(4);
  await expect(fri.getByText(/Nothing planned for/)).toHaveCount(2); // Breakfast and Dinner; Lunch holds the planned food
  await fri.getByRole('button', { name: 'Add to Dinner' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: /^Recipes/ }).click();
  await sheet.getByLabel('Find a recipe').fill('Skyr');
  await sheet.getByRole('button', { name: 'Plan Skyr for Dinner' }).click();
  await expect(sheet.getByRole('status')).toContainText('Planned Skyr for Dinner. It is flagged Need to buy'); // the sheet says why the card carries the flag
});

test('planning a Need food on several days says so once, before any skipped day', async ({ page }) => {
  await seedAhead(page, { '2026-09-26': [{ k: 'r', id: 'skyr', s: 'dinner' }] }); // Skyr is already planned on Saturday, so that day is skipped
  await openNutrition(page);
  await page.locator('.nb-col[data-day="2026-09-25"]').getByRole('button', { name: 'Add to Dinner' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'This day on' }).click();
  await sheet.getByRole('button', { name: /^Recipes/ }).click();
  await sheet.getByLabel('Find a recipe').fill('Skyr');
  await sheet.getByRole('button', { name: 'Plan Skyr for Dinner' }).click();
  await expect(sheet.getByRole('status')).toContainText(/Planned Skyr for Dinner on \d+ days\. It is flagged Need to buy.*Skipped /); // the note comes before the skipped day, not after it
});

test('ticking Have on Groceries clears the flag and frees the tick', async ({ page }) => {
  await seed(page);
  await openNutrition(page);
  await expect(card(page, 'Greek yogurt').locator('.wb-stock')).toHaveText('Need to buy');
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.evaluate(() => { location.hash = '#/daily/grocery/home'; });
  await page.locator('#groc-have-yog').click();
  await openNutrition(page);
  await expect(card(page, 'Greek yogurt').locator('.wb-stock')).toHaveText('Have');
  await expect(todayCol(page).getByRole('checkbox', { name: 'Check Greek yogurt as eaten' })).toBeEnabled();
});

test('a past day is never flagged: its column has no cards, pills or Need line', async ({ page }) => {
  await seed(page);
  await openNutrition(page);
  const past = page.locator('.nb-col.past').first();
  await expect(past).toHaveCount(1); // the fixed clock is a Thursday, so earlier days of the week are past columns
  await expect(past.locator('.wb-card, .nf-line, .wb-stock')).toHaveCount(0); // no plan cards and no stock pills
});
