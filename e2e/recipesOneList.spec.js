import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { startRecipe } from './recipesNav.js';

// Recipes as one list (brief recipes-mine-library-merge). The grouping, the counts and the box rules are node tests (src/lib/recipeMerged.test.ts);
// this covers the wiring: the folded box and its request count, the box under your rows, + Add to mine with Undo, the filter, and the signed-out line.
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const item = (n, name) => ({ id: `c:wbc:r${n}`, name, data: { recipe: { cat: 'other', ing: ['salt'], steps: ['Cook.'] } } });
const make = async (page, name) => {
  await startRecipe(page);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Ingredient 1', { exact: true }).fill('salt');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'Back to recipes' }).click();
};
const mineRows = page => page.locator('.rc-merged > .rc-list .rc-row b');
const boxRows = page => page.locator('#recipes-library-box .rc-row b');

const signedIn = async (page, items, more = false) => {
  await page.addInitScript(() => { localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:session/known', 'true'); });
  await page.route('**/api/sync*', json(200, { rows: [], cursor: '1', more: false }));
  await page.route('**/api/me', json(200, { ok: true, userId: 'dev-user', account: { kind: 'dev', email: null, name: null } }));
  await page.route('**/api/commands/**', json(200, { rows: [], cursor: '1' }));
  const asked = [];
  await page.route('**/api/catalog/search?*', route => { asked.push(route.request().url()); return json(200, { ok: true, items, more })(route); });
  return asked;
};

test('the library is folded until Browse the library or search text; Mine never asks; the counts end in + while more pages exist', async ({ page }) => {
  const asked = await signedIn(page, [item(1, 'Apple pie'), item(2, 'Bread'), item(3, 'Chili')], true);
  await page.goto('/');
  await openRecipes(page);
  await make(page, 'Bread'); // yours; a library recipe of the same name is another recipe, so only a real copy hides one
  await expect(page.getByRole('button', { name: 'Browse the library' })).toBeVisible();
  await expect(page.locator('#recipes-library-box')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Your recipes/ })).toHaveCount(0); // no box, nothing to tell apart
  await expect(page.locator('#recipes-library .rc-count')).toHaveCount(0); // no count before the library has loaded
  expect(asked).toHaveLength(0);
  await page.getByRole('button', { name: 'Browse the library' }).click();
  await expect(boxRows(page)).toHaveText(['Apple pie', 'Bread', 'Chili']);
  await expect(page.getByRole('heading', { name: 'Your recipes (1)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Library · not in your recipes yet \(3\+\)/ })).toBeVisible();
  await expect(page.locator('#recipes-library')).toContainText('3+'); // more pages can be loaded
  await expect(page.locator('#recipes-all')).toContainText('4+');
  await expect(page.locator('#recipes-mine')).toContainText('1');
  await expect(page.locator('.rc-libitem')).toHaveCount(3);
  expect(asked).toHaveLength(1);
  await page.click('#recipes-mine'); // Mine: no box and no new request
  await expect(page.locator('#recipes-library-box')).toHaveCount(0);
  await expect(mineRows(page)).toHaveText(['Bread']);
  expect(asked).toHaveLength(1);
  await page.click('#recipes-all'); // the box comes back with the page it already has: no second request for the same search
  await expect(boxRows(page)).toHaveCount(3);
  expect(asked).toHaveLength(1);
  await page.click('#recipes-library'); // Library: only the box
  await expect(page.getByRole('heading', { name: /Your recipes/ })).toHaveCount(0);
  await expect(boxRows(page)).toHaveCount(3);
});

test('typing asks the library, + Add to mine moves a row up with the notice, and Undo puts it back', async ({ page }) => {
  const asked = await signedIn(page, [item(1, 'Apple pie'), item(2, 'Apple crumble')]);
  await page.goto('/');
  await openRecipes(page);
  await make(page, 'Apple dip');
  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('apple');
  await expect(page.getByRole('heading', { name: 'Your recipes (1)' })).toBeVisible(); // the heading shows once the box is open
  await expect(mineRows(page)).toHaveText(['Apple dip']);
  await expect(boxRows(page)).toHaveText(['Apple pie', 'Apple crumble']);
  expect(asked).toHaveLength(1);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze(); // the box, the dashed rows and the buttons
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  await page.getByRole('button', { name: '+ Add to mine Apple pie' }).click();
  await expect(page.getByText('Apple pie added to Mine.')).toBeVisible();
  await expect(mineRows(page)).toHaveText(['Apple dip', 'Apple pie']);
  await expect(boxRows(page)).toHaveText(['Apple crumble']); // a library recipe you have is listed once, under Your recipes
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(mineRows(page)).toHaveText(['Apple dip']);
  await expect(boxRows(page)).toHaveText(['Apple pie', 'Apple crumble']);
});

test('signed out the box is the sign-in line, and it says the nutrition and tag filters do not apply', async ({ page }) => {
  await page.goto('/');
  await openRecipes(page);
  await make(page, 'Soup');
  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('soup');
  await expect(page.locator('#recipes-library-box #recipes-library-signin')).toContainText('Sign in to browse the recipe library.');
  await expect(page.locator('#recipes-library-box .rc-list')).toHaveCount(0);
  await expect(page.locator('#recipes-library-box')).not.toContainText('nutrition and tag filters');
  await page.getByRole('button', { name: 'High protein' }).click();
  await expect(page.locator('#recipes-library-box')).toContainText('Your nutrition and tag filters do not apply here');
  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('');
  await expect(page.locator('#recipes-library-box')).toHaveCount(0); // folded again with no text
});

test('the Library filter shows the box even while Recent was on', async ({ page }) => {
  await page.goto('/');
  await openRecipes(page);
  await make(page, 'Soup');
  await page.locator('.rc-row', { hasText: 'Soup' }).first().click();
  await page.getByRole('button', { name: 'Star Soup' }).click();
  await page.getByRole('button', { name: 'Back to recipes' }).click();
  await page.click('#recipes-recent');
  await expect(page.locator('#recipes-recent')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#recipes-library');
  await expect(page.locator('#recipes-library-box')).toBeVisible(); // Recent is switched off by the Library filter, so it cannot hide the box
  await expect(page.locator('#recipes-recent')).toHaveCount(0);
});

test('the filter and search are kept while another Daily section is open; the box is folded again on return', async ({ page }) => {
  await page.goto('/');
  await openRecipes(page);
  await make(page, 'Soup');
  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('so');
  await page.click('#recipes-library');
  await page.click('#daily-grocery');
  await page.click('#daily-recipes');
  await expect(page.locator('#recipes-library')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toHaveValue('so');
  await page.click('#recipes-all');
  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('');
  await page.getByRole('button', { name: 'Browse the library' }).click();
  await expect(page.locator('#recipes-library-box')).toBeVisible();
  await page.click('#daily-grocery');
  await page.click('#daily-recipes');
  await expect(page.getByRole('button', { name: 'Browse the library' })).toBeVisible(); // whether Browse is open is not kept
});

test('a failed library search shows the failure line with Try again, and your recipes are unaffected', async ({ page }) => {
  await signedIn(page, []);
  await page.route('**/api/catalog/search?*', json(500, { ok: false }));
  await page.goto('/');
  await openRecipes(page);
  await make(page, 'Soup');
  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('soup');
  await expect(page.locator('#recipes-library-box').getByRole('alert')).toContainText('Couldn’t load the library.');
  await expect(page.locator('#recipes-library-box').getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(mineRows(page)).toHaveText(['Soup']);
});

test('going back to an earlier search, or reopening the box, reuses its result while Recipes stays open (one request per search)', async ({ page }) => {
  const asked = await signedIn(page, [item(1, 'Apple pie'), item(2, 'Apple crumble')]);
  await page.goto('/');
  await openRecipes(page);
  const search = page.getByRole('searchbox', { name: 'Search recipes' });
  await search.fill('apple');
  await expect(boxRows(page)).toHaveText(['Apple pie', 'Apple crumble']);
  expect(asked).toHaveLength(1);
  await search.fill('pear');
  await expect(page.getByRole('heading', { name: /Library/ })).toBeVisible();
  await expect.poll(() => asked.length).toBe(2);
  await search.fill(''); // the box folds
  await expect(page.locator('#recipes-library-box')).toHaveCount(0);
  await search.fill('apple'); // reopened: the earlier answer, no third request
  await expect(boxRows(page)).toHaveText(['Apple pie', 'Apple crumble']);
  await page.waitForTimeout(500); // longer than the typing delay, so a request that was going to be made has been
  expect(asked).toHaveLength(2);
});
