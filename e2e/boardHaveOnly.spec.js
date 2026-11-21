import { test, expect } from './fixtures.js';
import { openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Brief ready-made-have-gate: the Nutrition board tucks away a ready-made food that Groceries says you Need, behind a "waiting on inventory" chip. The rules (what hides, totals, repeats, handy rows) are node tests (src/lib/haveOnly.test.ts, weekBoard.test.ts, repeats.test.ts); this covers the wiring: hide, chip, reveal without buttons, a tick on Groceries bringing it back, and what never hides.
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
    ['oats', 'yog', 'dr', 'bowl'].map(id => ({ k: 'r', id, s: 'snack' })),
  ]);
  await page.reload();
};
const card = (page, name) => todayCol(page).locator('.wb-card', { hasText: name });

test('a Need ready-made food is hidden behind the chip; recipes and no-match foods stay; reveal shows it dimmed with nothing to tap', async ({ page }) => {
  await seed(page);
  await openNutrition(page);
  await expect(card(page, 'Greek yogurt')).toHaveCount(0);
  await expect(card(page, 'Oats')).toHaveCount(1);
  await expect(card(page, 'Dragon fruit')).toHaveCount(1); // matches nothing: never hidden
  await expect(card(page, 'Yogurt bowl')).toHaveCount(1); // a recipe with ingredients: never hidden
  await expect(todayCol(page).locator('.wb-slothd').filter({ hasText: 'Snack' })).toContainText('3 on the menu');
  const chip = todayCol(page).getByRole('button', { name: /1 waiting on inventory/ });
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-expanded', 'true');
  const row = todayCol(page).locator('.wc-row', { hasText: 'Greek yogurt' });
  await expect(row.locator('.wb-stock')).toHaveText('Need');
  await expect(row.getByRole('button')).toHaveCount(0); // nothing to tap: stock and shopping stay on Groceries
  await expect(row.getByRole('checkbox')).toHaveCount(0);
  await page.reload(); // the reveal is this visit only
  await openNutrition(page);
  await expect(todayCol(page).getByRole('button', { name: /1 waiting on inventory/ })).toHaveAttribute('aria-expanded', 'false');
});

const seedAhead = async page => { // a day ahead: Lunch holds only a food that is Need, and a second Need food waits to be planned
  await page.evaluate(([recipes, items, plan]) => {
    localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: recipes }));
    localStorage.setItem('ironlog:grocery/main', JSON.stringify({ stores: ['Anywhere'], items }));
    const c = JSON.parse(localStorage.getItem('ironlog:config/main') || '{}');
    localStorage.setItem('ironlog:config/main', JSON.stringify({ ...c, diet: { plan: { '2026-09-25': plan } } }));
  }, [[food('yog', 'Greek yogurt'), food('skyr', 'Skyr')], [item('yog', 'Greek yogurt'), item('skyr', 'Skyr')], [{ k: 'r', id: 'yog', s: 'lunch' }]]);
  await page.reload();
};

test('a day-ahead meal that holds only a waiting food keeps its header Add, and planning another waiting food says where it went', async ({ page }) => {
  await seedAhead(page);
  await openNutrition(page);
  const fri = page.locator('.nb-col[data-day="2026-09-25"]');
  await expect(fri.getByRole('button', { name: /1 waiting on inventory/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(fri.getByRole('button', { name: /^Add to / })).toHaveCount(4); // Lunch holds only a tucked-away food and still has its Add
  await expect(fri.getByText('Nothing planned')).toHaveCount(3); // Breakfast, Lunch and Dinner read empty while the chip is closed
  await fri.getByRole('button', { name: /1 waiting on inventory/ }).click();
  await expect(fri.locator('.wc-row', { hasText: 'Greek yogurt' })).toBeVisible();
  await expect(fri.getByText('Nothing planned')).toHaveCount(2); // Lunch shows the waiting row instead
  await fri.getByRole('button', { name: 'Add to Dinner' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: /^Recipes/ }).click();
  await sheet.getByLabel('Find a recipe').fill('Skyr');
  await sheet.getByRole('button', { name: 'Plan Skyr for Dinner' }).click();
  await expect(sheet.getByRole('status')).toContainText('Planned Skyr for Dinner. It is waiting on inventory'); // the meal still reads Nothing planned, so the sheet says why
});

test('ticking Have on Groceries brings the food back, and the chip goes away', async ({ page }) => {
  await seed(page);
  await openNutrition(page);
  await expect(todayCol(page).getByRole('button', { name: /waiting on inventory/ })).toHaveCount(1);
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.evaluate(() => { location.hash = '#/daily/grocery/home'; });
  await page.locator('#groc-have-yog').click();
  await openNutrition(page);
  await expect(card(page, 'Greek yogurt').locator('.wb-stock')).toHaveText('Have');
  await expect(todayCol(page).getByRole('button', { name: /waiting on inventory/ })).toHaveCount(0);
});

test('a past day is never gated: its column has no cards, pills or chip', async ({ page }) => {
  await seed(page);
  await openNutrition(page);
  const past = page.locator('.nb-col.past').first();
  await expect(past).toHaveCount(1); // the fixed clock is a Thursday, so earlier days of the week are past columns
  await expect(past.locator('.wb-card, .wc-row, .wb-stock')).toHaveCount(0); // no plan cards and no stock pills
  await expect(past.locator('.wc-chip')).toHaveCount(0);
});
