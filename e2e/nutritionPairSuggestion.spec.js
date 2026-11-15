import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// The suggestion after logging (brief recipes-goes-with, part 3). Which partners are offered is a node test (pairSuggestions.test.ts); this covers the
// real Log sheet and the log control: the offer after Log it, one tap logging the partner, and Undo taking only that entry back.
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
  await page.getByRole('dialog').getByRole('button', { name: 'Log', exact: true }).click();
  const offer = page.getByRole('group', { name: 'Goes with it' });
  await expect(offer.getByRole('button', { name: '+ Rice, also log it' })).toBeVisible();
  await expect(offer.getByRole('button', { name: '+ Plain, also log it' })).toHaveCount(0); // no numbers, so it cannot be logged
  await offer.getByRole('button', { name: '+ Rice, also log it' }).click();
  await expect(offer.getByText(/Logged .* of Rice/)).toBeVisible();
  await offer.getByRole('button', { name: 'Undo Rice' }).click();
  await expect(offer.getByRole('button', { name: '+ Rice, also log it' })).toBeVisible();
  await expect(page.getByText(/Logged .* to today/)).toBeVisible(); // the chili entry is still there
});

test('The log control on the recipe page offers it too, and a recipe with no pairing offers nothing', async ({ page }) => {
  await seed(page);
  await row(page, 'Chili').click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Goes with it' }).getByRole('button', { name: '+ Rice, also log it' })).toBeVisible();
});

test('The log control twice offers the partner again after the second log', async ({ page }) => {
  await seed(page);
  await row(page, 'Chili').click();
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  const offer = page.getByRole('group', { name: 'Goes with it' });
  await offer.getByRole('button', { name: '+ Rice, also log it' }).click();
  await expect(offer.getByText(/Logged .* of Rice/)).toBeVisible();
  await page.getByRole('button', { name: 'Log another' }).click();
  await page.getByRole('button', { name: 'Log', exact: true }).click(); // a second log of the chili is a new log: Rice is on offer again
  await expect(offer.getByRole('button', { name: '+ Rice, also log it' })).toBeVisible();
});

test('the Goes with it row has no accessibility violations and 44 px targets on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await page.locator('.rc-item', { hasText: 'Chili' }).getByRole('button', { name: 'Log' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Log', exact: true }).click();
  const offer = page.getByRole('group', { name: 'Goes with it' });
  await expect(offer.getByRole('button', { name: '+ Rice, also log it' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('.dt-pair').analyze();
  expect(axe.violations).toEqual([]);
  for (const b of await offer.getByRole('button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(43.5);
  await offer.getByRole('button', { name: '+ Rice, also log it' }).click();
  await expect(offer.getByRole('button', { name: 'Undo Rice' })).toBeVisible();
  const axe2 = await new AxeBuilder({ page }).include('.dt-pair').analyze();
  expect(axe2.violations).toEqual([]);
  for (const b of await offer.getByRole('button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(43.5);
});
