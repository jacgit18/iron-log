import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { openSection, startRecipe } from './recipesNav.js';

// The Library section (briefs recipes-mine-library-merge, foods-made-and-store-bought). The grouping and the counts are node tests (src/lib/recipeMerged.test.ts, foodSections.test.ts);
// this covers the wiring: the library asks only when its section is open, its request count, Add to Mine with Undo, and the signed-out line.
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const item = (n, name) => ({ id: `c:wbc:r${n}`, name, data: { recipe: { cat: 'other', ing: ['salt'], steps: ['Cook.'] } } });
const make = async (page, name) => {
  await startRecipe(page);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Ingredient 1', { exact: true }).fill('salt');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
};
// a recipe written with no steps is a meal, so `make` leaves it in Meals; a library copy has steps and lands in Recipes
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

test('the library asks only when its section is open; Mine never asks; the count ends in + while more pages exist', async ({ page }) => {
  const asked = await signedIn(page, [item(1, 'Apple pie'), item(2, 'Bread'), item(3, 'Chili')], true);
  await page.goto('/');
  await openRecipes(page);
  await make(page, 'Bread'); // yours; a library recipe of the same name is another recipe, so only a real copy hides one
  await expect(page.getByRole('button', { name: 'Browse the library' })).toHaveCount(0); // no Browse button and no dashed box: Library is a section
  await expect(page.locator('#recipes-library-box')).toHaveCount(0);
  await expect(page.locator('#recipes-sec-library .rc-count')).toHaveCount(0); // no count before the library has loaded
  expect(asked).toHaveLength(0);
  await openSection(page, 'library');
  await expect(boxRows(page)).toHaveText(['Apple pie', 'Bread', 'Chili']);
  await expect(page.locator('#recipes-sec-library')).toContainText('3+'); // more pages can be loaded
  await expect(page.locator('.rc-libitem')).toHaveCount(3);
  await expect(page.getByText('Library recipes are from the Wikibooks Cookbook, CC BY-SA 4.0.')).toBeVisible();
  expect(asked).toHaveLength(1);
  await openSection(page, 'meals'); // Meals: no library rows and no new request; the count stays from the page it has
  await expect(page.locator('#recipes-library-box')).toHaveCount(0);
  await expect(mineRows(page)).toHaveText(['Bread']);
  await expect(page.locator('#recipes-sec-library')).toContainText('3+');
  expect(asked).toHaveLength(1);
  await openSection(page, 'library'); // back with the page it already has: no second request for the same search
  await expect(boxRows(page)).toHaveCount(3);
  expect(asked).toHaveLength(1);
});

test('searching in Meals does not ask the library; opening Library asks, Add to Mine moves a row to Recipes with the notice, and Undo puts it back', async ({ page }) => {
  const asked = await signedIn(page, [item(1, 'Apple pie'), item(2, 'Apple crumble')]);
  await page.goto('/');
  await openRecipes(page);
  await make(page, 'Apple dip');
  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('apple');
  await expect(mineRows(page)).toHaveText(['Apple dip']);
  await page.waitForTimeout(500); // longer than the typing delay
  expect(asked).toHaveLength(0);
  await openSection(page, 'library');
  await expect(boxRows(page)).toHaveText(['Apple pie', 'Apple crumble']);
  expect(asked).toHaveLength(1);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze(); // the section, the dashed rows and the buttons
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  await page.getByRole('button', { name: 'Add to Mine Apple pie' }).click();
  await expect(page.getByText('Apple pie added to Mine.')).toBeVisible();
  await expect(boxRows(page)).toHaveText(['Apple crumble']); // a library recipe you have is listed once, in your own section
  await openSection(page, 'recipes');
  await expect(mineRows(page)).toHaveText(['Apple pie']);
  await openSection(page, 'library');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(boxRows(page)).toHaveText(['Apple pie', 'Apple crumble']);
  await openSection(page, 'recipes');
  await expect(page.locator('#recipes-empty')).toContainText('Nothing in this section matches'); // the copy is gone from Recipes (the search 'apple' is still on)
});

test('signed out the Library section is the sign-in line, and it says the nutrition and tag filters do not apply', async ({ page }) => {
  await page.goto('/');
  await openRecipes(page);
  await make(page, 'Soup');
  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('soup');
  await openSection(page, 'library');
  await expect(page.locator('#recipes-library-box #recipes-library-signin')).toContainText('Sign in to browse the recipe library.');
  await expect(page.locator('#recipes-library-box .rc-list')).toHaveCount(0);
  await expect(page.locator('#recipes-library-box')).not.toContainText('nutrition and tag filters');
  await openSection(page, 'meals');
  await page.getByRole('button', { name: 'High protein' }).click(); // a filter set on your own items, which the library cannot apply
  await openSection(page, 'library');
  await expect(page.locator('#recipes-library-box')).toContainText('Your nutrition and tag filters do not apply here');
  await openSection(page, 'meals');
  await expect(page.locator('#recipes-library-box')).toHaveCount(0); // the line belongs to the Library section
});

test('the Library section is shown even while Recent was on, and has no Recent of its own', async ({ page }) => {
  await page.goto('/');
  await openRecipes(page);
  await make(page, 'Soup');
  await page.locator('.rc-row', { hasText: 'Soup' }).first().click();
  await page.getByRole('button', { name: 'Star Soup' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.click('#recipes-recent');
  await expect(page.locator('#recipes-recent')).toHaveAttribute('aria-pressed', 'true');
  await openSection(page, 'library');
  await expect(page.locator('#recipes-library-box')).toBeVisible(); // Recent is switched off by the section, so it cannot hide the list
  await expect(page.locator('#recipes-recent')).toHaveCount(0);
});

test('the section and search are kept while another Daily section is open', async ({ page }) => {
  await page.goto('/');
  await openRecipes(page);
  await make(page, 'Soup');
  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('so');
  await openSection(page, 'library');
  await page.click('#daily-grocery');
  await page.click('#daily-recipes');
  await expect(page.locator('#recipes-sec-library')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toHaveValue('so');
  await openSection(page, 'meals');
  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('');
  await page.click('#daily-grocery');
  await page.click('#daily-recipes');
  await expect(page.locator('#recipes-sec-meals')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#recipes-library-box')).toHaveCount(0);
});

test('a failed library search shows the failure line with Try again, and your recipes are unaffected', async ({ page }) => {
  await signedIn(page, []);
  await page.route('**/api/catalog/search?*', json(500, { ok: false }));
  await page.goto('/');
  await openRecipes(page);
  await make(page, 'Soup');
  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('soup');
  await openSection(page, 'library');
  await expect(page.locator('#recipes-library-box').getByRole('alert')).toContainText('Couldn’t load the library.');
  await expect(page.locator('#recipes-library-box').getByRole('button', { name: 'Try again' })).toBeVisible();
  await openSection(page, 'meals');
  await expect(mineRows(page)).toHaveText(['Soup']);
});

test('going back to an earlier search, or leaving Library and returning, reuses its result while Recipes stays open (one request per search)', async ({ page }) => {
  const asked = await signedIn(page, [item(1, 'Apple pie'), item(2, 'Apple crumble')]);
  await page.goto('/');
  await openRecipes(page);
  const search = page.getByRole('searchbox', { name: 'Search recipes' });
  await search.fill('apple');
  await openSection(page, 'library');
  await expect(boxRows(page)).toHaveText(['Apple pie', 'Apple crumble']);
  expect(asked).toHaveLength(1);
  await search.fill('pear');
  await expect.poll(() => asked.length).toBe(2);
  await search.fill('apple'); // the earlier answer, no third request
  await expect(boxRows(page)).toHaveText(['Apple pie', 'Apple crumble']);
  await openSection(page, 'meals');
  await openSection(page, 'library'); // reopened: the same answer again
  await expect(boxRows(page)).toHaveText(['Apple pie', 'Apple crumble']);
  await page.waitForTimeout(500); // longer than the typing delay, so a request that was going to be made has been
  expect(asked).toHaveLength(2);
});

test('typing apple, pear, apple before the first answer arrives sends one apple request, and the answer is not shown for pear', async ({ page }) => {
  await signedIn(page, [item(1, 'Apple pie')]);
  const asked = [];
  let release = () => {};
  const held = new Promise(r => { release = r; });
  await page.route('**/api/catalog/search?*', async route => { // registered last, so it answers instead of signedIn's route
    const q = new URL(route.request().url()).searchParams.get('q');
    asked.push(q);
    if (q === 'apple') await held; // the first answer is slow
    return json(200, { ok: true, items: q === 'apple' ? [item(1, 'Apple pie')] : [item(2, 'Pear tart')], more: false })(route);
  });
  await page.goto('/');
  await openRecipes(page);
  const search = page.getByRole('searchbox', { name: 'Search recipes' });
  await search.fill('apple');
  await openSection(page, 'library');
  await expect.poll(() => asked.length).toBe(1);
  await search.fill('pear');
  await expect.poll(() => asked.length).toBe(2);
  await expect(boxRows(page)).toHaveText(['Pear tart']);
  await search.fill('apple'); // the apple request is still in flight: wait for it, no second one
  await page.waitForTimeout(500);
  expect(asked.filter(q => q === 'apple')).toHaveLength(1);
  release();
  await expect(boxRows(page)).toHaveText(['Apple pie']);
  expect(asked).toEqual(['apple', 'pear']);
});
