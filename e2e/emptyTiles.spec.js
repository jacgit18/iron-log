import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// First-action tiles on an empty Groceries list (At home) and an empty Recipes list (Mine). Each tile starts an action that already exists.
const noViolations = async page => {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
};
const groceries = async page => { await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-home'); };
const recipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const tiles = page => page.locator('.emptytiles button');

test('empty Groceries shows three tiles; Add an item starts Edit with the name box focused', async ({ page }) => {
  await groceries(page);
  await expect(page.getByRole('heading', { name: 'Start your grocery list' })).toBeVisible();
  await expect(tiles(page)).toHaveCount(3);
  await noViolations(page);
  await page.click('#groc-tile-add');
  await expect(page.locator('#groc-name')).toBeFocused();
  await expect(page.locator('.emptytiles')).toHaveCount(0);
});

test('empty Groceries: Set up sharing opens Sharing; Browse recipes opens Recipes; tiles go once an item exists', async ({ page }) => {
  await groceries(page);
  await page.click('#groc-tile-sharing');
  await expect(page.locator('#groc-sharing')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#groc-tile-recipes');
  await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible();
  await page.click('#daily-grocery');
  await page.click('#groc-view-home');
  await page.click('#groc-tile-add');
  await page.fill('#groc-name', 'Eggs');
  await page.click('#groc-add');
  await page.click('#groc-done');
  await expect(page.locator('.emptytiles')).toHaveCount(0);
});

test('empty Recipes shows three tiles that open the form, the Library and the ready-made form; they go once a recipe exists', async ({ page }) => {
  await recipes(page);
  await expect(page.getByRole('heading', { name: 'Add your first recipe' })).toBeVisible();
  await expect(tiles(page)).toHaveCount(3);
  await noViolations(page);
  await page.click('#rc-tile-library');
  await expect(page.locator('#recipes-library')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#recipes-mine');
  await page.click('#rc-tile-ready');
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
  await page.goBack();
  await recipes(page);
  await page.click('#rc-tile-new');
  await page.getByLabel('Name', { exact: true }).fill('Toast');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('bread');
  await page.getByLabel('Steps, one per line').fill('Toast it.');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: /Back to recipes/ }).click();
  await expect(page.locator('.emptytiles')).toHaveCount(0);
});

test('phone is one column with targets of 44px; desktop is three across', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const open of [groceries, recipes]) {
    await open(page);
    const boxes = await tiles(page).evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), w: r.width, h: r.height }; }));
    expect(new Set(boxes.map(b => b.x)).size).toBe(1);
    for (const b of boxes) { expect(b.w).toBeGreaterThanOrEqual(44); expect(b.h).toBeGreaterThanOrEqual(44); }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const open of [groceries, recipes]) {
    await open(page);
    const ys = await tiles(page).evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().y)));
    expect(new Set(ys).size).toBe(1);
  }
});
