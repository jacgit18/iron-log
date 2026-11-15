import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, todayCol } from './nutritionBoardHelpers.js';

// Remove on a planned card asks twice (brief shared-macro-line-and-two-tap-removes, ADR 023): the first tap arms it and removes nothing, a blur disarms it, the second tap removes.
// The card's number text is the shared macro line, "Needs numbers" when a food has none. The rules are node tests; this is the armed state, which is DOM.
const mk = (id, n, cat, extra = {}) => ({ id, n, cat, ing: [{ n: 'x' }], steps: ['Cook.'], ...extra });
const items = [mk('chili', 'Chili', 'protein', { kcal: 400, p: 30, c: 20, f: 14 }), mk('plain', 'Plain rice', 'carbs')];
const TOMORROW = '2026-09-25'; // the fixed clock is Thursday 2026-09-24
const col = page => page.locator(`.nb-col[data-day="${TOMORROW}"]`);

const planned = async (page, name) => {
  await page.evaluate(l => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })), items);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-supplements');
  await expect(page.locator('#nb-h')).toBeVisible();
  await col(page).locator('.nb-dayname').click();
  const sheet = await openAdd(page, 'Recipes');
  await sheet.getByRole('group', { name: 'Which meal' }).getByRole('button', { name: 'Dinner', exact: true }).click();
  await sheet.getByLabel('Find a recipe').fill(name);
  await sheet.getByRole('button', { name: `Plan ${name} for Dinner` }).click();
  await closeSheet(page);
  await col(page).locator('.wb-card', { hasText: name }).click();
};

test('Remove on a planned card: the first tap arms it, a blur disarms it, the second removes', async ({ page }) => {
  await planned(page, 'Chili');
  const card = col(page).locator('.wb-card', { hasText: 'Chili' });
  await expect(card).toContainText('400 kcal · P 30 g');
  const rm = col(page).getByRole('button', { name: 'Remove Chili' });
  await rm.click();
  await expect(rm).toHaveText('Tap again to remove');
  await expect(card).toHaveCount(1); // nothing removed yet
  await rm.blur();
  await expect(col(page).getByRole('button', { name: 'Remove Chili' })).toHaveText('Remove');
  await expect(card).toHaveCount(1);
  await rm.click(); await rm.click();
  await expect(col(page).locator('.wb-card', { hasText: 'Chili' })).toHaveCount(0);
});

test('a planned food with no numbers reads Needs numbers', async ({ page }) => {
  await planned(page, 'Plain rice');
  await expect(col(page).locator('.wb-card', { hasText: 'Plain rice' })).toContainText('Needs numbers');
});
