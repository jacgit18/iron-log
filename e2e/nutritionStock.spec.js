import { test, expect } from './fixtures.js';
import { openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Brief grocery-stock-flag: the Nutrition board card says whether the food is at home, from the Groceries Inventory tick. The rules (match, n of m, past days, eaten, saved meals) are node tests (src/lib/boardStock.test.ts); this covers the wiring: the pill, a tick on Groceries changing it, and a card with no match.
// A ready-made food that is Need is tucked behind the chip since brief ready-made-have-gate (e2e/boardHaveOnly.spec.js), so its Need pill shows on the revealed row.
// The fixed clock is Thursday 2026-09-24.
const food = (id, n) => ({ id, n, cat: 'ready', ing: [], steps: [], kcal: 100, p: 5 });
const item = (id, n) => ({ id, n, store: 'Anywhere', qty: 1, cents: null, every: false, out: false });
const seed = async page => {
  await page.evaluate(([recipes, items, cfg]) => {
    localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: recipes }));
    localStorage.setItem('ironlog:grocery/main', JSON.stringify({ stores: ['Anywhere'], items }));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify({ lines: { oats: { have: true } }, pulled: [] }));
    const c = JSON.parse(localStorage.getItem('ironlog:config/main') || '{}');
    localStorage.setItem('ironlog:config/main', JSON.stringify({ ...c, diet: { plan: { '2026-09-24': cfg } } }));
  }, [[food('oats', 'Oats'), food('yog', 'Greek yogurt'), food('dr', 'Dragon fruit')], [item('oats', 'Oats'), item('yog', 'Greek yogurt')], ['oats', 'yog', 'dr'].map(id => ({ k: 'r', id, s: 'snack' }))]);
  await page.reload();
};
const card = (page, name) => todayCol(page).locator('.wb-card', { hasText: name });

test('a card shows Have or Need from the Inventory tick, and a tick on Groceries changes it on return', async ({ page }) => {
  await seed(page);
  await openNutrition(page);
  await expect(card(page, 'Oats').locator('.wb-stock')).toHaveText('Have');
  await expect(card(page, 'Greek yogurt')).toHaveCount(0); // Need and ready-made: tucked away
  await todayCol(page).getByRole('button', { name: /waiting on inventory/ }).click();
  await expect(todayCol(page).locator('.wc-row', { hasText: 'Greek yogurt' }).locator('.wb-stock')).toHaveText('Need');
  await expect(card(page, 'Dragon fruit').locator('.wb-stock')).toHaveCount(0); // no matching item: nothing, never "out"
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.evaluate(() => { location.hash = '#/daily/grocery/home'; });
  await page.locator('#groc-have-yog').click();
  await openNutrition(page);
  await expect(card(page, 'Greek yogurt').locator('.wb-stock')).toHaveText('Have');
});

const figures = page => todayCol(page).evaluate(c => ({ meters: c.querySelector('.nb-meters, .wb-meters')?.textContent ?? '', heads: [...c.querySelectorAll('.wb-slothd')].map(h => h.textContent) }));

test('a Need food waits out of the count; with no Groceries data every food is counted and unmarked; no mark on a card ticked as eaten', async ({ page }) => {
  await seed(page);
  await openNutrition(page);
  await expect(card(page, 'Oats').locator('.wb-stock')).toHaveText('Have');
  expect((await figures(page)).heads.join(' ')).toContain('2 on the menu'); // Greek yogurt is Need and waits
  await page.evaluate(() => { localStorage.setItem('ironlog:grocery/main', JSON.stringify({ stores: ['Anywhere'], items: [] })); });
  await page.reload();
  await openNutrition(page);
  await expect(todayCol(page).locator('.wb-stock')).toHaveCount(0); // no Groceries items: no marks
  expect((await figures(page)).heads.join(' ')).toContain('3 on the menu');
  await seed(page);
  await openNutrition(page);
  await todayCol(page).getByRole('checkbox', { name: /Oats as eaten/ }).click();
  await expect(card(page, 'Oats').locator('.wb-stock')).toHaveCount(0);
  await expect(card(page, 'Greek yogurt')).toHaveCount(0);
});
