import { test, expect } from './fixtures.js';

// Sort on the Recipes screen (brief recipes-sort). The orders themselves are node tests (recipeList.test.ts, server/catalog.test.ts). This covers
// what they cannot see: the control on both tabs, each tab remembering its own choice across a reload, the Library sending sort=name to the API and
// starting again from the first page, and the "Sorted by" line. The Library API is scripted (the account is signed in, syncing is on).
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const make = async (page, name, minutes) => {
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Ingredient 1', { exact: true }).fill('salt');
  if (minutes) await page.getByLabel('Minutes').fill(String(minutes));
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'Back to recipes' }).click();
};
const rows = page => page.locator('.rc-list .rc-row b');
const sortBox = page => page.getByLabel('Sort');

test('Mine: Name A to Z is the default, Newest and Quickest reorder, and the choice is kept after a reload', async ({ page }) => {
  await openRecipes(page);
  await make(page, 'Chili', 45);
  await make(page, 'apple dip', 5);
  await make(page, 'Béchamel');
  await expect(sortBox(page)).toHaveValue('name');
  await expect(rows(page)).toHaveText(['apple dip', 'Béchamel', 'Chili']); // case and accents ignored
  await sortBox(page).selectOption('newest');
  await expect(rows(page)).toHaveText(['Béchamel', 'apple dip', 'Chili']);
  await sortBox(page).selectOption('time');
  await expect(rows(page)).toHaveText(['apple dip', 'Chili', 'Béchamel']); // no time goes last
  await page.reload();
  await openRecipes(page);
  await expect(sortBox(page)).toHaveValue('time');
  await expect(rows(page)).toHaveText(['apple dip', 'Chili', 'Béchamel']);
});

test('Mine: the sort still works when browser storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    const block = () => { throw new DOMException('blocked', 'SecurityError'); };
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('ironlog:sort:')) block(); return real.call(this, k, v); };
  });
  await page.reload();
  await openRecipes(page);
  await make(page, 'Chili', 45);
  await make(page, 'Apple', 5);
  await sortBox(page).selectOption('newest');
  await expect(rows(page)).toHaveText(['Apple', 'Chili']);
});

const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const recipe = (n, name) => ({ id: `c:wbc:r${n}`, name, data: { recipe: { cat: 'other', ing: ['salt'], steps: ['Cook.'] } } });

test('Library: a name sort sends sort=name, starts again from the first page, says how it is sorted, and is remembered', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:session/known', 'true');
  });
  await page.route('**/api/sync*', json(200, { rows: [], cursor: '1', more: false }));
  await page.route('**/api/me', json(200, { ok: true, userId: 'dev-user', account: { kind: 'dev', email: null, name: null } }));
  await page.route('**/api/commands/**', json(200, { rows: [], cursor: '1' }));
  const asked = [];
  await page.route('**/api/catalog/search?*', route => {
    const u = new URL(route.request().url());
    asked.push(u.search);
    const byName = u.searchParams.get('sort') === 'name' || !u.searchParams.get('q'); // as the server: no words is name order
    const first = Number(u.searchParams.get('offset')) === 0;
    if (!first) return json(200, { ok: true, items: [recipe(3, 'Third')], more: false })(route);
    return json(200, { ok: true, items: byName ? [recipe(1, 'Apple'), recipe(2, 'Bread')] : [recipe(2, 'Bread'), recipe(1, 'Apple')], more: true })(route);
  });
  await page.goto('/');
  await openRecipes(page);
  await page.click('#recipes-library');
  await expect(rows(page)).toHaveText(['Apple', 'Bread']); // the server's order, kept as it came
  await expect(page.getByText('Sorted by name, A to Z')).toBeVisible(); // nothing typed
  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('bread');
  await expect(page.getByText('Sorted by best match')).toBeVisible();
  await expect(rows(page)).toHaveText(['Bread', 'Apple']);
  await page.getByRole('button', { name: 'Show more' }).click();
  await expect(rows(page)).toHaveText(['Bread', 'Apple', 'Third']);
  await sortBox(page).selectOption('name');
  await expect(rows(page)).toHaveText(['Apple', 'Bread']); // back to page one: the extra page is gone
  await expect(page.getByText('Sorted by name, A to Z')).toBeVisible();
  expect(asked.at(-1)).toContain('sort=name');
  expect(asked.filter(s => s.includes('sort=')).every(s => s.includes('sort=name'))).toBe(true); // relevance is never sent
  await page.reload();
  await openRecipes(page);
  await page.click('#recipes-library');
  await expect(sortBox(page)).toHaveValue('name');
  await page.click('#recipes-mine');
  await expect(sortBox(page)).toHaveValue('name'); // Mine has its own choice (also name by default)
  await sortBox(page).selectOption('newest');
  await page.click('#recipes-library');
  await expect(sortBox(page)).toHaveValue('name'); // not changed by Mine
});
