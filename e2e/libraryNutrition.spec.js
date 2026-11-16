import { test, expect } from './fixtures.js';
import { unfoldAll } from './recipesNav.js';

// Library recipes arrive with numbers (brief library-recipe-nutrition, ADR 134). The rules (what is counted, the show rule, the servings estimate, the rescale) are node tests
// (src/shared/libraryNutrition.test.ts, src/lib/recipeDraft.test.ts); this covers the wiring against a mocked search answer: the row badge ending in "est.", the view's note line,
// a recipe without numbers, the copy carrying numbers and mark, a typed number clearing the mark, and a servings change rescaling.
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const est = { kcal: 300, p: 9, c: 40, f: 10, micro: { iron: 2 }, servings: 4, est: { of: 1, n: 2, sEst: true } };
const items = [
  { id: 'c:wbc:n1', name: 'Pancakes', data: { recipe: { cat: 'breakfast', ing: ['2 cups flour', '1 egg'], steps: ['Mix.'], ...est } } },
  { id: 'c:wbc:n2', name: 'Porridge', data: { recipe: { cat: 'breakfast', ing: ['1 cup oats', '2 cups milk'], steps: ['Stir.'], servings: 2, kcal: 220, p: 8, c: 35, f: 5, est: { of: 2, n: 2 } } } },
  { id: 'c:wbc:n3', name: 'Plain toast', data: { recipe: { cat: 'breakfast', ing: ['2 slices bread'], steps: ['Toast.'], servings: 1 } } },
];

const signedIn = async page => {
  await page.addInitScript(() => { localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:session/known', 'true'); });
  await page.route('**/api/sync*', json(200, { rows: [], cursor: '1', more: false }));
  await page.route('**/api/me', json(200, { ok: true, userId: 'dev-user', account: { kind: 'dev', email: null, name: null } }));
  await page.route('**/api/commands/**', json(200, { rows: [], cursor: '1' }));
  await page.route('**/api/catalog/search?*', json(200, { ok: true, items, more: false }));
};
const openBox = async page => { await signedIn(page); await page.goto('/'); await openRecipes(page); await page.getByRole('button', { name: 'Browse the library' }).click(); };
const row = (page, name) => page.locator('#recipes-library-box .rc-item', { hasText: name });

for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`a library row with numbers shows the macro badge ending in est., a row without shows none (${size.width}px)`, async ({ page }) => {
    await page.setViewportSize(size);
    await openBox(page);
    await expect(row(page, 'Pancakes').locator('.rc-badge')).toContainText('300 kcal');
    await expect(row(page, 'Pancakes').locator('.rc-badge')).toContainText('est.');
    await expect(row(page, 'Pancakes').locator('.rc-badge')).toContainText('estimated'); // the words a screen reader gets
    await expect(row(page, 'Plain toast').locator('.rc-badge')).toHaveCount(0);
  });

  test(`the library view shows the summary strip and the note: at least with a count, servings estimated; All counted; no numbers keeps today's line (${size.width}px)`, async ({ page }) => {
    await page.setViewportSize(size);
    await openBox(page);
    await row(page, 'Pancakes').locator('.rc-row').click();
    await expect(page.locator('.rc-strip')).toContainText('300 kcal');
    await expect(page.getByText('Estimated from the ingredients. 1 of 2 counted, so these are at least. About 4 servings, estimated.')).toBeVisible();
    await page.getByRole('button', { name: 'Back to recipes' }).click();
    await row(page, 'Porridge').locator('.rc-row').click();
    await expect(page.getByText('Estimated from the ingredients. All 2 counted.')).toBeVisible();
    await page.getByRole('button', { name: 'Back to recipes' }).click();
    await row(page, 'Plain toast').locator('.rc-row').click();
    await expect(page.getByText(/No nutrition yet/)).toBeVisible();
    await expect(page.getByText(/Estimated from the ingredients/)).toHaveCount(0);
  });
}

test('+ Add to mine carries the numbers and the mark; a servings change rescales; a typed number clears the mark', async ({ page }) => {
  await openBox(page);
  await row(page, 'Pancakes').getByRole('button', { name: /Add to mine/ }).click();
  await page.locator('#recipes-mine').click();
  const mine = page.locator('.rc-merged > .rc-list .rc-item', { hasText: 'Pancakes' });
  await expect(mine.locator('.rc-badge')).toContainText('300 kcal');
  await expect(mine.locator('.rc-badge')).toContainText('est.');
  await mine.locator('.rc-row').click();
  await expect(page.getByText(/1 of 2 counted, so these are at least/)).toBeVisible();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await unfoldAll(page);
  await page.getByLabel('Servings', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.locator('.rc-strip')).toContainText('150 kcal'); // 300 over 4 servings, now over 8
  await expect(page.getByText(/1 of 2 counted, so these are at least\.$/)).toBeVisible(); // still estimated, the servings sentence is gone
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await unfoldAll(page);
  await page.getByLabel('Calories per serving').fill('999');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.locator('.rc-strip')).toContainText('999 kcal');
  await expect(page.getByText(/Estimated from the ingredients/)).toHaveCount(0);
});
