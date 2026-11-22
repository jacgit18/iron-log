import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Brief recipe-auto-nutrition, PR 3: Fill nutrition on a recipe page. The rules (which lines, the sums, "at least", blanks against replace, the mark, servings) are node tests (lib/recipeFill.test.ts,
// ingredientsClient.test.ts, store/recipesSlice.test.ts); this covers the wiring a node test cannot see: the action on the page, the sheet's rows, buttons and servings field, what Save writes and
// what Undo puts back, and the failure words. The resolver route is stubbed (no model, no USDA). Admin session. The fixed clock is Thursday 2026-09-24.
const mk = (id, n, extra = {}) => ({ id, n, cat: 'protein', ing: [{ n: 'rice', amt: '200 g' }, { n: 'olive oil', amt: '1 tbsp' }, { n: 'dragon fruit' }, { n: 'saffron' }], steps: ['Cook.'], ...extra });
const matched = (line, food, grams, from, confidence, per100) => ({ line, status: 'matched', fdcId: per100.id, food, grams, gramsFrom: from, confidence, per100 });
const ANSWER = lines => ({
  ok: true, left: 4, max: 5,
  lines: [
    matched(lines[0], 'Rice, white', 200, 'text', 'high', { id: 1, name: 'Rice, white', kcal: 130, p: 2.7, c: 28, f: 0.3, micro: { iron: 1, zinc: 1 } }),
    matched(lines[1], 'Oil, olive', 14, 'converted', 'low', { id: 2, name: 'Oil, olive', kcal: 884, p: 0, f: 100 }),
    { line: lines[2], status: 'none' },
    { line: lines[3], status: 'none', retry: true },
  ],
});
const stub = (page, status = 200, body = ANSWER) => page.route('**/api/ingredients/resolve', route => {
  const lines = JSON.parse(route.request().postData() || '{}').lines || [];
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(typeof body === 'function' ? body(lines) : body) });
});
const seed = async (page, recipes) => {
  await page.evaluate(r => { localStorage.setItem('ironlog:session/admin', 'true'); localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: r })); }, recipes);
  await page.reload();
};
const saved = page => page.evaluate(() => (JSON.parse(localStorage.getItem('ironlog:recipes/main') || '{}').items || [])[0]);
const open = async (page, name) => { await page.click('#tab-daily'); await page.click('#daily-recipes'); await page.getByRole('button', { name: new RegExp(name) }).first().click(); };
const sheet = page => page.getByRole('dialog');

test.describe('Fill nutrition', () => {
  test('a recipe with no numbers and no servings: rows, servings required, Save writes the numbers and the mark, Undo puts them back', async ({ page }) => {
    await stub(page);
    await seed(page, [mk('r1', 'Rice bowl')]);
    await open(page, 'Rice bowl');
    await page.getByRole('button', { name: 'Fill nutrition' }).click();
    const s = sheet(page);
    await expect(s.getByRole('listitem').filter({ hasText: '200 g rice' })).toContainText('Sure');
    await expect(s.getByRole('listitem').filter({ hasText: '1 tbsp olive oil' })).toContainText('Check');
    await expect(s.getByRole('listitem').filter({ hasText: 'dragon fruit' })).toContainText('No match');
    await expect(s.getByRole('listitem').filter({ hasText: 'saffron' })).toContainText('Try again'); // retry is offered again, never "No match"
    await expect(s.getByText('4 fills left today.')).toBeVisible();
    await expect(s.getByRole('button', { name: 'Save' })).toBeDisabled(); // no servings yet
    await s.getByLabel('Servings this makes').fill('2');
    await expect(s.locator('.fill-macros')).toContainText('Estimated · 2 of 4 counted');
    await expect(s.getByRole('button', { name: 'Replace all' })).toHaveCount(0); // nothing typed: one Save
    await s.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved. Filled from 2 of 4 ingredients.' })).toBeVisible();
    const r = await saved(page);
    expect(r).toMatchObject({ kcal: 192, servings: 2, micro: { iron: 1, zinc: 1 }, est: { of: 2, n: 4 } });
    expect(r.edited).toBeUndefined();
    await expect(page.getByRole('button', { name: 'Fill again' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Summary' })).toContainText('Estimated');
    await page.getByRole('button', { name: 'Undo' }).click();
    const back = await saved(page);
    expect(back.kcal).toBeUndefined(); expect(back.micro).toBeUndefined(); expect(back.est).toBeUndefined(); expect(back.servings).toBeUndefined();
  });

  test('a recipe with typed numbers asks: Fill only the blanks keeps them, Replace all does not; unticking a line changes the count', async ({ page }) => {
    await stub(page);
    await seed(page, [mk('r1', 'Rice bowl', { servings: 2, kcal: 999, p: 50 })]);
    await open(page, 'Rice bowl');
    await page.getByRole('button', { name: 'Fill nutrition' }).click();
    const s = sheet(page);
    await expect(s.getByLabel('Servings this makes')).toHaveCount(0);
    await s.getByLabel('Count 1 tbsp olive oil').uncheck();
    await expect(s.locator('.fill-macros')).toContainText('1 of 4 counted');
    await expect(s.getByRole('button', { name: 'Save' })).toHaveCount(0);
    await s.getByRole('button', { name: 'Fill only the blanks' }).click();
    expect(await saved(page)).toMatchObject({ kcal: 999, p: 50, c: 28, micro: { iron: 1 }, est: { of: 1, n: 4 } });
    await page.getByRole('button', { name: 'Fill again' }).click();
    await sheet(page).getByRole('button', { name: 'Replace all' }).click();
    expect(await saved(page)).toMatchObject({ kcal: 192, p: 2.7 }) // a new sheet counts both lines again, over 2 servings;
  });

  test('a Try again line has a control that asks again for only that line (review finding 2)', async ({ page }) => {
    const sent = [];
    await page.route('**/api/ingredients/resolve', route => {
      const lines = JSON.parse(route.request().postData() || '{}').lines || [];
      sent.push(lines);
      const body = lines.length === 4 ? ANSWER(lines) : { ok: true, left: 3, max: 5, lines: [matched(lines[0], 'Saffron', 1, 'guess', 'low', { id: 9, name: 'Saffron', kcal: 310, p: 11 })] };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await seed(page, [mk('r1', 'Rice bowl', { servings: 2 })]);
    await open(page, 'Rice bowl');
    await page.getByRole('button', { name: 'Fill nutrition' }).click();
    const s = sheet(page);
    await expect(s.getByRole('listitem').filter({ hasText: 'saffron' })).toContainText('Try again');
    await s.getByRole('button', { name: 'Try the 1 line again' }).click();
    await expect(s.getByRole('listitem').filter({ hasText: 'saffron' })).toContainText('Check');
    await expect(s.getByRole('button', { name: /again$/ })).toHaveCount(0);
    expect(sent[1]).toEqual(['saffron']);
    await expect(s.getByText('3 fills left today.')).toBeVisible();
  });

  test('Log stays Added after a Fill, and each Undo undoes its own action (review finding 1)', async ({ page }) => {
    await stub(page);
    await seed(page, [mk('r1', 'Rice bowl', { servings: 2, kcal: 400, p: 20 })]);
    await open(page, 'Rice bowl');
    await page.getByRole('button', { name: 'Log', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Added' })).toBeDisabled();
    await page.getByRole('button', { name: 'Fill nutrition' }).click();
    await sheet(page).getByRole('button', { name: 'Fill only the blanks' }).click();
    await expect(page.getByRole('button', { name: 'Added' })).toBeDisabled(); // not flipped back: a second tap would log twice
    await page.getByRole('button', { name: 'Undo' }).click(); // the Fill's
    expect((await saved(page)).est).toBeUndefined();
    await expect(page.getByRole('button', { name: 'Added' })).toBeDisabled();
    await page.getByRole('button', { name: 'Undo' }).click(); // the add's
    await expect(page.getByRole('button', { name: 'Log', exact: true })).toBeEnabled();
  });

  test('the cap, an unavailable service and Cancel save nothing', async ({ page }) => {
    await stub(page, 503, { ok: false, why: 'cap', retryAfterSec: 7200 });
    await seed(page, [mk('r1', 'Rice bowl')]);
    await open(page, 'Rice bowl');
    await page.getByRole('button', { name: 'Fill nutrition' }).click();
    await expect(sheet(page).getByRole('alert')).toHaveText('Fill nutrition has reached its daily limit. Try again in about 2 hours.');
    await sheet(page).getByRole('button', { name: 'Close' }).click();
    await page.unroute('**/api/ingredients/resolve');
    await stub(page, 503, { ok: false, why: 'no-key' });
    await page.getByRole('button', { name: 'Fill nutrition' }).click();
    await expect(sheet(page).getByRole('alert')).toHaveText('Fill nutrition is not available right now.');
    await sheet(page).getByRole('button', { name: 'Close' }).click();
    expect((await saved(page)).kcal).toBeUndefined();
  });

  test('is not offered for a ready-made food, a recipe with no ingredients, or one in the Library', async ({ page }) => {
    await seed(page, [mk('r2', 'Protein bar', { cat: 'ready', type: 'ready', ing: [], kcal: 200, p: 20 })]);
    await open(page, 'Protein bar');
    await expect(page.getByRole('button', { name: /Fill (nutrition|again)/ })).toHaveCount(0);
  });

  test('the sheet has no axe violations at 375 px in light and dark', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await stub(page);
    await seed(page, [mk('r1', 'Rice bowl')]);
    await open(page, 'Rice bowl');
    await page.getByRole('button', { name: 'Fill nutrition' }).click();
    await expect(sheet(page).getByText('Sure')).toBeVisible();
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      const r = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      expect(r.violations, scheme).toEqual([]);
    }
  });
});
