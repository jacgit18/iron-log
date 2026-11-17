import { test, expect } from './fixtures.js';
import { startRecipe, newMenuVisible } from './recipesNav.js';
import { openNutrition } from './nutritionBoardHelpers.js';

// Progress here is the hub with drill-in pages, which is what a window under 1280px shows (progressOnePage.spec.js covers the wide page).
test.use({ viewport: { width: 1100, height: 900 } });

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
  await page.getByRole('button', { name: 'Exercises', exact: true }).click();
  await expect.poll(() => hash(page)).toBe('#/program/exercises');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Exercises', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Programs' }).click();
  await expect.poll(() => hash(page)).toMatch(/^#\/program\/[ab]$/); // the program shown has its own address (e2e/boardUrls.spec.js)
});

test('the Daily section and the Grocery view are in the address', async ({ page }) => {
  await page.click('#tab-daily');
  await page.click('#daily-grocery');
  await expect.poll(() => hash(page)).toMatch(/^#\/daily\/grocery/);
  await page.click('#groc-view-bought');
  await expect.poll(() => hash(page)).toBe('#/daily/grocery/bought');
  await page.click('#groc-bought-history');
  await expect.poll(() => hash(page)).toBe('#/daily/grocery/bought/history');
  await page.reload();
  await expect(page.locator('#groc-view-bought')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#groc-bought-history')).toHaveAttribute('aria-pressed', 'true');
});

test('a recipe form adds a Back step; a reload on it shows the list', async ({ page }) => {
  await page.click('#tab-daily');
  await page.click('#daily-recipes');
  await startRecipe(page);
  await expect.poll(() => hash(page)).toBe('#/daily/recipes/form');
  await page.goBack();
  await newMenuVisible(page);
  expect(await hash(page)).toBe('#/daily/recipes');
  await page.goForward();
  await page.reload(); // the recipe itself is not in the address, so there is nothing to show but the list
  await newMenuVisible(page);
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

// The Nutrition week list (brief nutrition-meal-labels-year-repeat): a viewed week is never an address; the dropdown (desktop) and the sheet (phone) leave `#/daily/nutrition` as it is. The fixed clock is Thursday 2026-09-24.
test('picking a week from the dropdown keeps the address; Back and a reload leave the board on Nutrition', async ({ page }) => {
  await openNutrition(page);
  expect(await hash(page)).toBe('#/daily/nutrition');
  await page.locator('.nb-weekname').click();
  const list = page.getByRole('dialog', { name: 'Choose a week' });
  await expect(list.getByRole('button', { name: /^This week/ })).toHaveAttribute('aria-current', 'true');
  await expect(list.getByRole('button')).toHaveCount(54); // last week, this week, then 52 weeks ahead
  await list.getByRole('button', { name: /^In 5 weeks/ }).click();
  await expect(list).toHaveCount(0);
  await expect(page.locator('.nb-weekname')).toHaveText('In 5 weeks');
  await expect(page.locator('.nb-col').first()).toHaveAttribute('data-day', '2026-10-25');
  expect(await hash(page)).toBe('#/daily/nutrition');
  await page.reload();
  await expect(page.locator('#nb-h')).toBeVisible();
  expect(await hash(page)).toBe('#/daily/nutrition');
  await expect(page.locator('.nb-weekname')).toHaveText('This week'); // a reload shows this week, as it always did
});

test('the arrows and the list end at 52 weeks ahead and at last week', async ({ page }) => {
  await openNutrition(page);
  await page.locator('.nb-weekname').click();
  await page.getByRole('dialog', { name: 'Choose a week' }).getByRole('button', { name: /^In 52 weeks/ }).click();
  await expect(page.locator('.nb-weekname')).toHaveText('In 52 weeks');
  await expect(page.getByRole('button', { name: 'Next week' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page.locator('.nb-weekname')).toHaveText('In 51 weeks');
  await page.locator('.nb-weekname').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'This week', exact: true }).click();
  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page.getByRole('button', { name: 'Previous week' })).toHaveAttribute('aria-disabled', 'true'); // nothing is logged before last week
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test('the week list is a bottom sheet with one Back step and a Close button', async ({ page }) => {
    await openNutrition(page);
    await page.locator('.nb-weekname').click();
    const sheet = page.getByRole('dialog', { name: 'Choose a week' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await page.locator('.nb-weekname').click();
    await page.goBack(); // Back closes just the sheet
    await expect(sheet).toHaveCount(0);
    expect(await hash(page)).toBe('#/daily/nutrition');
    await page.locator('.nb-weekname').click();
    await sheet.getByRole('button', { name: /^In 3 weeks/ }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('.nb-weekname')).toHaveText('In 3 weeks');
    await expect(page.locator('.nb-col')).toHaveAttribute('data-day', '2026-10-11'); // the first day of the week
    expect(await hash(page)).toBe('#/daily/nutrition');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
});
