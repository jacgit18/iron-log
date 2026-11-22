import { test, expect } from './fixtures.js';
import { openNutrition, todayCol } from './nutritionBoardHelpers.js';

// The Planned and Available tray (brief nutrition-planned-available-tray, ADR 146). The rules (the plate and tray split, plan forward, the cap, Need) are node tests (availableTray.test.ts, planForward.test.ts,
// dietSlice.test.ts, haveOnly.test.ts); this covers the wiring: the closed tray and its state after a reload, Ate and Plan on a tray row, the question Plan asks, the 9th Plan, and Ate / Drank wording.
// The Need flag is in boardHaveOnly.spec.js. The fixed clock is Thursday 2026-09-24.
const TOMORROW = '2026-09-25', DAY3 = '2026-09-26';
const mk = (id, n, extra = {}) => ({ id, n, cat: 'sides', ing: [{ n: 'x' }], steps: ['Cook.'], kcal: 100, p: 5, ...extra });
const seed = async (page, plan, recipes = [mk('alm', 'Almonds'), mk('yog', 'Yogurt')]) => {
  await page.evaluate(([r, p]) => {
    localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: r }));
    const c = JSON.parse(localStorage.getItem('ironlog:config/main') || '{}');
    localStorage.setItem('ironlog:config/main', JSON.stringify({ ...c, diet: { plan: p } }));
  }, [recipes, plan]);
  await page.reload();
  await openNutrition(page);
};
const col = (page, day) => page.locator(`.nb-col[data-day="${day}"]`);
const snack = c => c.locator('.wb-slot', { has: c.page().locator('.wb-slothd b', { hasText: /^Snack$/ }) });
const trayBtn = (c, n) => snack(c).getByRole('button', { name: `Available · ${n} for Snack` });
const item = (id, p) => ({ k: 'r', id, s: 'snack', ...(p ? { p: true } : {}) });

test('a meal keeps its unplanned food in one closed tray; it opens by button, says Available · n, and remembers its state after a reload', async ({ page }) => {
  await seed(page, { [TOMORROW]: [item('alm'), item('yog', true)] });
  const fri = col(page, TOMORROW);
  await expect(snack(fri).locator('.wb-slothd')).toContainText('1 planned · 1 available');
  await expect(snack(fri).locator('.wb-card')).toHaveCount(1); // only the planned one is on the plate
  await expect(trayBtn(fri, 1)).toHaveAttribute('aria-expanded', 'false');
  await trayBtn(fri, 1).focus();
  await page.keyboard.press('Enter');
  await expect(trayBtn(fri, 1)).toHaveAttribute('aria-expanded', 'true');
  await expect(snack(fri).getByRole('list', { name: 'Available foods for Snack' }).getByText('Almonds')).toBeVisible();
  await page.reload(); await openNutrition(page);
  await expect(trayBtn(col(page, TOMORROW), 1)).toHaveAttribute('aria-expanded', 'true');
  await trayBtn(col(page, TOMORROW), 1).click();
  await page.reload(); await openNutrition(page);
  await expect(trayBtn(col(page, TOMORROW), 1)).toHaveAttribute('aria-expanded', 'false');
});

test('Ate on a tray row puts the food on the plate as eaten, unplanned, and counts it toward the day', async ({ page }) => {
  await seed(page, { '2026-09-24': [item('alm'), item('yog')] });
  const today = todayCol(page);
  await trayBtn(today, 2).click();
  await snack(today).getByRole('button', { name: 'Ate Almonds' }).click();
  await expect(snack(today).locator('.wb-slothd')).toContainText('100 kcal eaten · 0 planned · 1 available');
  await expect(snack(today).getByRole('checkbox', { name: 'Uncheck Almonds as eaten' })).toBeChecked();
  await expect(snack(today).locator('.wb-planned')).toHaveCount(0);
});

test('Plan on a food with no future copy marks this day without asking; Unplan puts it back in the tray', async ({ page }) => {
  await seed(page, { [TOMORROW]: [item('alm')] });
  const fri = col(page, TOMORROW);
  await trayBtn(fri, 1).click();
  await snack(fri).getByRole('button', { name: 'Plan Almonds' }).click();
  await expect(page.getByRole('group', { name: 'Plan Almonds' })).toHaveCount(0); // nothing to ask
  await expect(snack(fri).locator('.wb-slothd')).toContainText('1 planned · 0 available');
  await snack(fri).locator('.wb-card', { hasText: 'Almonds' }).click();
  await snack(fri).getByRole('button', { name: 'Unplan Almonds' }).click();
  await expect(snack(fri).locator('.wb-slothd')).toContainText('0 planned · 1 available');
  await expect(page.getByText('Unplanned', { exact: false }).first()).toBeVisible(); // the board's Undo notice
});

test('Plan asks This day only or This day and every future day it appears when a future copy exists', async ({ page }) => {
  await seed(page, { [TOMORROW]: [item('alm')], [DAY3]: [item('alm')] });
  const fri = col(page, TOMORROW), sat = col(page, DAY3);
  await trayBtn(fri, 1).click();
  await snack(fri).getByRole('button', { name: 'Plan Almonds' }).click();
  const ask = page.getByRole('group', { name: 'Plan Almonds' });
  await expect(ask.getByRole('button', { name: 'This day only' })).toBeVisible();
  await ask.getByRole('button', { name: 'This day only' }).click();
  await expect(snack(fri).locator('.wb-slothd')).toContainText('1 planned');
  await expect(snack(sat).locator('.wb-slothd')).toContainText('0 planned · 1 available'); // the later day is untouched
  // Unplan Friday, then plan it for every future day
  await snack(fri).locator('.wb-card', { hasText: 'Almonds' }).click();
  await snack(fri).getByRole('button', { name: 'Unplan Almonds' }).click();
  await snack(fri).getByRole('button', { name: 'Plan Almonds' }).click();
  await page.getByRole('group', { name: 'Plan Almonds' }).getByRole('button', { name: 'This day and every future day it appears' }).click();
  await expect(snack(fri).locator('.wb-slothd')).toContainText('1 planned');
  await expect(snack(sat).locator('.wb-slothd')).toContainText('1 planned · 0 available');
  await expect(page.getByText('Planned Almonds for Fri 25 and every future day it appears.')).toBeVisible();
});

test('a ninth Plan is refused with the reason and the food stays in the tray', async ({ page }) => {
  const eight = Array.from({ length: 8 }, (_, i) => ({ k: 'r', id: `f${i}`, s: 'lunch', p: true }));
  await seed(page, { [TOMORROW]: [...eight, item('alm')] }, [mk('alm', 'Almonds'), ...eight.map((x, i) => mk(x.id, `Food ${i}`))]);
  const fri = col(page, TOMORROW);
  await trayBtn(fri, 1).click();
  await snack(fri).getByRole('button', { name: 'Plan Almonds' }).click();
  await expect(page.getByText('A day can hold 8 planned things. Unplan one to plan another.')).toBeVisible();
  await expect(snack(fri).locator('.wb-slothd')).toContainText('0 planned · 1 available');
});

test('a food is checked as eaten and a drink is logged as drunk; a drink has no Plan and no tray', async ({ page }) => {
  await seed(page, { '2026-09-24': [{ k: 'r', id: 'yog', s: 'snack', p: true }, { k: 'r', id: 'tea', s: 'snack' }] }, [mk('yog', 'Yogurt'), mk('tea', 'Green tea', { uses: ['drink'] })]);
  const today = todayCol(page);
  await expect(today.getByRole('checkbox', { name: 'Check Yogurt as eaten' })).toBeVisible();
  await expect(today.getByRole('checkbox', { name: 'Log Green tea as drunk' })).toBeVisible();
  await expect(today.getByRole('button', { name: /^Plan Green tea/ })).toHaveCount(0);
  await expect(today.getByRole('button', { name: /^Available · / })).toHaveCount(0);
  await today.getByRole('checkbox', { name: 'Log Green tea as drunk' }).click();
  await expect(today.getByRole('checkbox', { name: 'Uncheck Green tea as drunk' })).toBeChecked();
});
