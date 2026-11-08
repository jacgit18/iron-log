import { test, expect } from './fixtures.js';

// The suggestion after logging (brief recipes-goes-with, part 3). Which partners are offered is a node test (pairSuggestions.test.ts); this covers the
// real Log sheet and Ate this: the offer after Log it, one tap logging the partner, and Undo taking only that entry back.
const seed = async page => {
  const mk = (id, n, cat, kcal, p, pairs) => ({ id, n, cat, ing: [{ n: 'x' }], steps: ['Cook.'], kcal, p, ...(pairs ? { pairs } : {}) });
  const items = [mk('chili', 'Chili', 'protein', 400, 30, ['rice', 'plain']), mk('rice', 'Rice', 'carbs', 200, 4, ['chili']), { id: 'plain', n: 'Plain', cat: 'carbs', ing: [{ n: 'x' }], steps: ['Cook.'], pairs: ['chili'] }];
  await page.evaluate(list => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: list })), items);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-recipes');
};
const row = (page, name) => page.locator('.rc-row', { hasText: name }).first();

test('after Log it, the partner with numbers is offered, one tap logs it, Undo removes only it', async ({ page }) => {
  await seed(page);
  await page.locator('.rc-item', { hasText: 'Chili' }).getByRole('button', { name: 'Log' }).click();
  await page.getByRole('button', { name: 'Log it' }).click();
  const offer = page.getByRole('group', { name: 'Goes with it' });
  await expect(offer.getByRole('button', { name: 'Also log Rice' })).toBeVisible();
  await expect(offer.getByRole('button', { name: 'Also log Plain' })).toHaveCount(0); // no numbers, so it cannot be logged
  await offer.getByRole('button', { name: 'Also log Rice' }).click();
  await expect(offer.getByText(/Logged .* of Rice/)).toBeVisible();
  await offer.getByRole('button', { name: 'Undo Rice' }).click();
  await expect(offer.getByRole('button', { name: 'Also log Rice' })).toBeVisible();
  await expect(page.getByText(/Logged .* to today/)).toBeVisible(); // the chili entry is still there
});

test('Ate this on the recipe page offers it too, and a recipe with no pairing offers nothing', async ({ page }) => {
  await seed(page);
  await row(page, 'Chili').click();
  await page.getByRole('button', { name: 'Ate this' }).click();
  await expect(page.getByRole('group', { name: 'Goes with it' }).getByRole('button', { name: 'Also log Rice' })).toBeVisible();
});
