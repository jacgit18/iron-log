import { test, expect } from './fixtures.js';
import { openSection, startRecipe, unfoldAll } from './recipesNav.js';

// Foods: Made / Store-bought sections (brief foods-made-and-store-bought, PR 2). Which section lists an item, the counts, Recent per section and the opening section are node
// tests (foodSections.test.ts, recipeRecent.test.ts, route.test.ts). A unit test cannot catch what this covers: the group switch and pills really drawing and switching, the address
// following the section across reload and Back, the other group's "n matches" chip while a search is typed, one record shown in two sections with one star, Save returning to the
// section the saved item belongs in, and a library recipe's page address.
const rc = (id, n, cat, extra = {}) => ({ id, n, cat, ing: [{ n: 'Rice' }], steps: ['Cook.'], servings: 2, kcal: 300, p: 20, ...extra });
const food = (id, n, extra = {}) => rc(id, n, 'ready', { ing: [], steps: [], type: 'ready', ...extra });
const items = [
  rc('box', 'Lunch box', 'other', { steps: [] }), rc('soup', 'Lentil soup', 'protein'),
  food('egg', 'Eggs', { uses: ['ingredient', 'ready'] }), food('bar', 'Granola bar'), food('milk', 'Oat milk', { type: 'drink' }),
];
const open = async (page, size = { width: 390, height: 844 }, detail = 'closed') => {
  await page.setViewportSize(size);
  await page.addInitScript(([l, d]) => { if (localStorage.getItem('ironlog:recipes/main') === null) localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })); localStorage.setItem('ironlog:sort:recipes-detail', d); }, [items, detail]);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-recipes');
};
const titles = page => page.locator('.rc-cards .rc-title b').allTextContents();
const hash = page => page.evaluate(() => location.hash);
const search = page => page.getByLabel('Search recipes');

test('the group switch and the section pills show their counts, switch the list and follow the address across a reload and Back', async ({ page }) => {
  await open(page);
  await expect.poll(() => hash(page)).toBe('#/daily/recipes/meals'); // the first of Meals, Recipes, Ready to eat with an item
  await expect(page.locator('#recipes-group-made')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#recipes-sec-meals')).toHaveText('Meals1');
  await expect(page.locator('#recipes-sec-recipes')).toHaveText('Recipes1');
  await expect(page.locator('#recipes-sec-library')).toHaveText('Library');
  expect(await titles(page)).toEqual(['Lunch box']);
  await page.click('#recipes-group-store'); // the group's first section
  await expect.poll(() => hash(page)).toBe('#/daily/recipes/ingredients');
  await expect(page.locator('#recipes-sec-ingredients')).toHaveText('Ingredients1');
  await expect(page.locator('#recipes-sec-ready')).toHaveText('Ready to eat2');
  await expect(page.locator('#recipes-sec-drinks')).toHaveText('Drinks1');
  await expect(page.locator('#recipes-sec-meals')).toHaveCount(0); // the pills are the open group's
  await page.click('#recipes-sec-ready');
  expect((await titles(page)).sort()).toEqual(['Eggs', 'Granola bar']);
  await page.reload(); // the address wins on reload
  await expect(page.locator('#recipes-sec-ready')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#recipes-group-store')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.rc-row', { hasText: 'Granola bar' }).click();
  await expect.poll(() => hash(page)).toBe('#/daily/recipes/mine');
  await page.goBack(); // Back goes up one screen: the section it was opened from
  await expect.poll(() => hash(page)).toBe('#/daily/recipes/ready');
  await expect(page.locator('#recipes-sec-ready')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#daily-grocery'); // the bare address opens the section last used this visit
  await page.click('#daily-recipes');
  await expect.poll(() => hash(page)).toBe('#/daily/recipes/ready');
});

test('a typed search narrows every section, and the other group says how many match', async ({ page }) => {
  await open(page);
  await expect(page.locator('.fs-hit')).toHaveCount(0); // no search, no chip
  await search(page).fill('egg');
  await expect(page.locator('#recipes-sec-meals')).toHaveText('Meals0');
  await expect(page.locator('#recipes-sec-recipes')).toHaveText('Recipes0');
  await expect(page.getByRole('button', { name: /1 match in Store-bought/ })).toBeVisible(); // Eggs is two sections but one match
  await expect(page.locator('#recipes-group-made .fs-hit')).toHaveCount(0); // not on the open group
  await expect(page.locator('#recipes-empty')).toContainText('Clear the search');
  await page.click('#recipes-group-store');
  await expect(page.locator('#recipes-sec-ingredients')).toHaveText('Ingredients1');
  await expect(page.locator('#recipes-sec-ready')).toHaveText('Ready to eat1');
  await expect(page.locator('#recipes-sec-drinks')).toHaveText('Drinks0');
  await expect(page.locator('#recipes-group-made')).toContainText('0 matches'); // signed out the library adds nothing, so no "+"
  await search(page).fill('');
  await expect(page.locator('.fs-hit')).toHaveCount(0);
  await expect(page.locator('#recipes-sec-ready')).toHaveText('Ready to eat2');
});

test('a food used two ways is one record in two sections, with one star and a Recent pill per section', async ({ page }) => {
  await open(page);
  await openSection(page, 'ingredients');
  await expect(page.locator('#recipes-recent')).toHaveCount(0); // nothing starred, logged or opened here yet
  await page.locator('.rc-row', { hasText: 'Eggs' }).click();
  await page.getByRole('button', { name: 'Star Eggs' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.rc-row', { hasText: 'Eggs' }).locator('.rc-favmark')).toBeVisible();
  await expect(page.locator('.rc-cards li', { hasText: 'Eggs' }).locator('.rc-typetag')).toHaveText('also Ready to eat');
  await openSection(page, 'ready');
  await expect(page.locator('.rc-row', { hasText: 'Eggs' }).locator('.rc-favmark')).toBeVisible(); // the same record
  await page.click('#recipes-recent');
  expect(await titles(page)).toEqual(['Eggs']);
  await openSection(page, 'drinks');
  await expect(page.locator('#recipes-recent')).toHaveCount(0); // Recent never mixes sections: nothing starred here
});

test('the planned marker: a row and the food\'s page show what the board plans in the next 7 days, and nothing when it plans nothing', async ({ page }) => {
  // The rules (window, repeats, eaten, saved meals) are node tests (plannedOnBoard.test.ts); this covers the wiring from the board's plan to the row pill and the page panel. The fixed clock is Thursday 2026-09-24.
  const plan = { '2026-09-25': [{ k: 'r', id: 'soup', s: 'lunch', p: true }, { k: 'r', id: 'bar', s: 'snack', p: true }], '2026-09-26': [{ k: 'r', id: 'bar', s: 'snack', p: true }, { k: 'r', id: 'egg' }], '2026-10-05': [{ k: 'r', id: 'box', p: true }] };
  await page.addInitScript(p => { const c = JSON.parse(localStorage.getItem('ironlog:config/main') || '{}'); localStorage.setItem('ironlog:config/main', JSON.stringify({ ...c, diet: { plan: p } })); }, plan);
  await open(page);
  await expect.poll(() => hash(page)).toBe('#/daily/recipes/meals');
  await expect(page.locator('.rc-row', { hasText: 'Lunch box' }).locator('.rc-planned')).toHaveCount(0); // planned after the 7 days
  await page.click('#recipes-sec-recipes');
  await expect(page.locator('.rc-row', { hasText: 'Lentil soup' }).locator('.rc-planned')).toHaveText('Planned · Fri lunch');
  await page.click('#recipes-group-store');
  await page.click('#recipes-sec-ready');
  await expect(page.locator('.rc-row', { hasText: 'Granola bar' }).locator('.rc-planned')).toHaveText('Planned · 2 days');
  await expect(page.locator('.rc-row', { hasText: 'Eggs' }).locator('.rc-planned')).toHaveCount(0); // stored but not marked planned
  await page.locator('.rc-row', { hasText: 'Granola bar' }).click();
  await expect(page.getByRole('heading', { name: 'Planned on the board' })).toBeVisible();
  await expect(page.locator('.rc-plannedbox')).toContainText('Fri snack, Sat snack');
  await page.goBack();
  await page.locator('.rc-row', { hasText: 'Eggs' }).click();
  await expect(page.locator('.rc-plannedbox')).toContainText('Not planned in the next 7 days.');
});

test('after Save the list returns to the section the new item belongs in (a page on a phone)', async ({ page }) => {
  await open(page);
  await expect.poll(() => hash(page)).toBe('#/daily/recipes/meals');
  await startRecipe(page);
  await page.getByLabel('Name', { exact: true }).fill('Beef stew');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('beef');
  await page.getByLabel('Steps, one per line').fill('Simmer.');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toContainText('Beef stew');
  await page.getByRole('button', { name: 'Back', exact: true }).click(); // it has steps, so it is a recipe: Recipes, not the Meals it was started from
  await expect.poll(() => hash(page)).toBe('#/daily/recipes/recipes');
  await expect(page.locator('#recipes-sec-recipes')).toHaveAttribute('aria-pressed', 'true');
  expect((await titles(page)).sort()).toEqual(['Beef stew', 'Lentil soup']);
});

test('after Save beside the list (desktop) the saved recipe is open in its section, and an edit that removes the steps moves it to Meals', async ({ page }) => {
  await open(page, { width: 1440, height: 900 }, 'auto');
  await startRecipe(page);
  await page.getByLabel('Name', { exact: true }).fill('Beef stew');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('beef');
  await page.getByLabel('Steps, one per line').fill('Simmer.');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect.poll(() => hash(page)).toBe('#/daily/recipes/recipes');
  await expect(page.locator('.rc-item.current')).toContainText('Beef stew');
  const pane = page.getByRole('complementary', { name: 'Recipe detail' });
  await pane.getByRole('button', { name: 'More actions' }).click();
  await pane.getByRole('button', { name: 'Edit', exact: true }).click();
  await unfoldAll(page);
  await page.getByLabel('Steps, one per line').fill('');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect.poll(() => hash(page)).toBe('#/daily/recipes/meals');
  await expect(page.locator('.rc-item.current')).toContainText('Beef stew');
});

test('a library recipe\'s page has its own address and Back returns to the Library section; a reload on it shows the Library section', async ({ page }) => {
  const json = (body) => route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.addInitScript(() => { localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:session/known', 'true'); });
  await page.route('**/api/sync*', json({ rows: [], cursor: '1', more: false }));
  await page.route('**/api/me', json({ ok: true, userId: 'dev-user', account: { kind: 'dev', email: null, name: null } }));
  await page.route('**/api/commands/**', json({ rows: [], cursor: '1' }));
  await page.route('**/api/catalog/search?*', json({ ok: true, items: [{ id: 'c:wbc:r1', name: 'Apple pie', data: { recipe: { cat: 'other', ing: ['salt'], steps: ['Cook.'] } } }], more: false }));
  await open(page);
  await openSection(page, 'library');
  await expect.poll(() => hash(page)).toBe('#/daily/recipes/library');
  await page.locator('.rc-row', { hasText: 'Apple pie' }).click();
  await expect.poll(() => hash(page)).toBe('#/daily/recipes/library/item');
  await expect(page.getByRole('heading', { name: 'Apple pie' })).toBeVisible();
  await page.goBack();
  await expect.poll(() => hash(page)).toBe('#/daily/recipes/library');
  await expect(page.locator('#recipes-sec-library')).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await page.reload(); // the library recipe itself is not in the address: the Library section shows
  await expect(page.locator('#recipes-sec-library')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => hash(page)).toBe('#/daily/recipes/library');
});
