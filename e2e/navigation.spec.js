import { test, expect } from './fixtures.js';

// Screen addresses and one Back model (brief navigation-urls). The route table is unit tested (src/lib/route.test.ts); this checks what a node test cannot:
// the real history stack, reload, an edited address, and the sheet entry. Tab switches swap the address; opening a page adds a Back step.
const hash = page => page.evaluate(() => location.hash);
const trends = page => page.locator('.hubtile', { hasText: 'Training trends' });

test('a tab switch changes the address, and Back walks back through the tabs with the address following', async ({ page }) => {
  await expect.poll(() => hash(page)).toBe('#/board/workout');
  await page.click('#tab-progress');
  await expect.poll(() => hash(page)).toBe('#/progress');
  await page.click('#tab-program');
  await expect.poll(() => hash(page)).toBe('#/program');
  await page.goBack(); // phone Back goes to the previous tab (src/lib/backNav.ts)
  await expect(page.locator('#tab-progress')).toHaveAttribute('aria-selected', 'true');
  expect(await hash(page)).toBe('#/progress');
  await page.goBack();
  await expect(page.locator('#tab-board')).toHaveAttribute('aria-selected', 'true');
  expect(await hash(page)).toBe('#/board/workout');
});

test('a Progress page adds one Back step, and a reload reopens it', async ({ page }) => {
  await page.click('#tab-progress');
  await trends(page).click();
  await expect.poll(() => hash(page)).toBe('#/progress/trends');
  await expect(page.locator('.hubback')).toBeVisible();
  await page.reload();
  await expect(page.locator('.hubback')).toBeVisible();
  expect(await hash(page)).toBe('#/progress/trends');
  await page.goBack(); // the page was opened by the address (the entry below is not ours): the back button and Back agree on the hub
  await page.goForward();
  await page.locator('.hubback .btn').click();
  await expect(trends(page)).toBeVisible();
  expect(await hash(page)).toBe('#/progress');
});

test('Back from a Progress page returns to the Progress hub, not out of the app', async ({ page }) => {
  await page.click('#tab-progress');
  await trends(page).click();
  await page.goBack();
  await expect(trends(page)).toBeVisible();
  expect(await hash(page)).toBe('#/progress');
  await page.goForward();
  await expect(page.locator('.hubback')).toBeVisible();
});

test('a tab switch from an open page: Back returns to that page, address included', async ({ page }) => {
  await page.click('#tab-progress');
  await trends(page).click();
  await page.click('#tab-board');
  await expect.poll(() => hash(page)).toBe('#/board/workout');
  await page.goBack();
  await expect(page.locator('#tab-progress')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.hubback')).toBeVisible(); // still on Training trends
  expect(await hash(page)).toBe('#/progress/trends');
});

test('the Program view is in the address and swaps in place', async ({ page }) => {
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Exercise library' }).click();
  await expect.poll(() => hash(page)).toBe('#/program/exercises');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Exercise library' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Programs' }).click();
  await expect.poll(() => hash(page)).toMatch(/^#\/program\/[ab]$/); // the program shown has its own address (e2e/boardUrls.spec.js)
});

test('the Daily section and the Grocery view are in the address', async ({ page }) => {
  await page.click('#tab-daily');
  await page.click('#daily-grocery');
  await expect.poll(() => hash(page)).toMatch(/^#\/daily\/grocery/);
  await page.click('#groc-view-spend');
  await expect.poll(() => hash(page)).toBe('#/daily/grocery/spend');
  await page.reload();
  await expect(page.locator('#groc-view-spend')).toHaveAttribute('aria-pressed', 'true');
});

test('a recipe form adds a Back step; a reload on it shows the list', async ({ page }) => {
  await page.click('#tab-daily');
  await page.click('#daily-recipes');
  await page.getByRole('button', { name: 'New recipe' }).click();
  await expect.poll(() => hash(page)).toBe('#/daily/recipes/form');
  await page.goBack();
  await expect(page.getByRole('button', { name: 'New recipe' })).toBeVisible();
  expect(await hash(page)).toBe('#/daily/recipes');
  await page.goForward();
  await page.reload(); // the recipe itself is not in the address, so there is nothing to show but the list
  await expect(page.getByRole('button', { name: 'New recipe' })).toBeVisible();
  await expect.poll(() => hash(page)).toBe('#/daily/recipes');
});

test('an unknown address opens Board, and an unknown page opens its tab', async ({ page }) => {
  await page.goto('/#/nope'); // the same document, so a reload is what opens the app on it
  await page.reload();
  await expect(page.locator('#tab-board')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => hash(page)).toBe('#/board/workout');
  await page.goto('/#/progress/zzz');
  await page.reload();
  await expect(page.locator('#tab-progress')).toHaveAttribute('aria-selected', 'true');
  await expect(trends(page)).toBeVisible();
});

test('an edited address moves to the tab it names', async ({ page }) => {
  await page.evaluate(() => { location.hash = '#/program'; });
  await expect(page.locator('#tab-program')).toHaveAttribute('aria-selected', 'true');
});

test('a sheet adds one Back step: Back closes just the sheet, Escape leaves no stray step', async ({ page }) => {
  await page.click('#tab-progress');
  await trends(page).click();
  const sheet = page.getByRole('dialog');
  await page.click('#help-btn');
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.hubback')).toBeVisible(); // still on the page the sheet was opened over
  expect(await hash(page)).toBe('#/progress/trends');
  await page.click('#help-btn');
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await page.goBack(); // one Back from here goes up from the page, so no step was left behind by the sheet
  await expect(trends(page)).toBeVisible();
  expect(await hash(page)).toBe('#/progress');
});

test('Skip to content keeps the address', async ({ page }) => {
  await page.click('#tab-progress');
  await trends(page).click();
  await page.locator('a.skip').focus();
  await page.keyboard.press('Enter');
  expect(await hash(page)).toBe('#/progress/trends');
  await expect(page.locator('.hubback')).toBeVisible();
});
