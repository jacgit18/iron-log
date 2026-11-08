import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Inventory's Edit mode (brief groceries-inventory-edit-list): store chips, search, one single-column list with collapsible stores, the Stores panel in the right rail from 1100 px.
// A unit test cannot catch the layout at three widths, the rail, focus after a move or the dock. The fixed date is in September 2026.
const item = (id, n, store) => ({ id, n, store, qty: 1, cents: 300, every: true, out: false });
const CATALOGUE = {
  stores: ['Costco', 'Aldi'],
  items: [...['Eggs', 'Chicken', 'Oil', 'Towels'].map(n => item(n.toLowerCase(), n, 'Costco')), item('milk', 'Milk', 'Aldi')],
};
const open = async page => {
  await page.evaluate(c => { localStorage.setItem('ironlog:grocery/main', JSON.stringify(c)); localStorage.setItem('ironlog:sort:grocery-details', 'closed'); }, CATALOGUE);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-inventory'); await page.click('#groc-edit');
};
const chip = (page, name) => page.getByRole('group', { name: 'Store' }).getByRole('button', { name });
const stores = page => page.locator('.gshoplist > .gstore');

test('Edit shows chips and one column at 390, 1280 and 1920; a chip shows one store; the search works and the chip survives Done', async ({ page }) => {
  await open(page);
  await expect(chip(page, /^All 5/)).toBeVisible();
  await expect(page.locator('.gcols')).toHaveCount(0);
  for (const [w, h] of [[390, 844], [1280, 800], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h });
    const lefts = await stores(page).evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(lefts).size, `one column at ${w}`).toBe(1);
  }
  await expect(page.getByRole('combobox', { name: /sort/i })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search groceries' }).fill('mil');
  await expect(page.locator('#groc-edit-arrow-milk')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search groceries' }).fill('zzz');
  await expect(page.locator('#groc-nomatch')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search groceries' }).fill('');
  await chip(page, /^Aldi/).click();
  await expect(stores(page)).toHaveCount(1);
  await page.click('#groc-edit');
  await expect(chip(page, /^Aldi/)).toHaveAttribute('aria-pressed', 'true');
});

test('a store folds to its header, opens for a search or an added item, and the dock stays', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const fold = page.getByRole('button', { name: /^Costco, 4 items/ });
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#groc-edit-arrow-eggs')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Done', exact: true }).first()).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search groceries' }).fill('eggs');
  await expect(page.locator('#groc-edit-arrow-eggs')).toBeVisible();
});

test('moving a row to another store under a chip switches the chip to All and keeps focus', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await chip(page, /^Costco/).click();
  await page.locator('#groc-edit-arrow-eggs').click();
  await page.locator('#groc-edit-store-eggs').selectOption('Aldi');
  await expect(chip(page, /^All/)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#groc-edit-store-eggs')).toBeFocused();
});

test('removing a store\'s last row under its chip keeps focus on a row that is on screen, and adding an item shows it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await chip(page, /^Aldi/).click();
  await page.locator('#groc-edit-arrow-milk').click();
  await page.getByRole('button', { name: /^Remove/ }).first().click();
  await page.getByRole('button', { name: 'Tap again to remove' }).click();
  await expect(page.locator('#groc-edit-arrow-milk')).toHaveCount(0);
  await expect(page.locator('#groc-edit-arrow-eggs, #groc-edit-arrow-chicken, #groc-edit-arrow-oil, #groc-edit-arrow-towels').first()).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search groceries' }).fill('egg');
  await page.locator('#groc-name').fill('Rice');
  await page.click('#groc-add');
  await expect(page.getByRole('searchbox', { name: 'Search groceries' })).toHaveValue('');
  await expect(page.getByRole('button', { name: /Rice/ }).first()).toBeVisible();
});

test('an open row stays listed when the search no longer matches it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await page.getByRole('searchbox', { name: 'Search groceries' }).fill('eggs');
  await page.locator('#groc-edit-arrow-eggs').click();
  await page.getByRole('searchbox', { name: 'Search groceries' }).fill('zzz');
  await expect(page.locator('#groc-edit-arrow-eggs')).toBeVisible();
});

test('adding an item under a chip switches to All so the new row shows', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await chip(page, /^Aldi/).click();
  await page.locator('#groc-name').fill('Rice');
  await page.click('#groc-add');
  await expect(chip(page, /^All/)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /Rice/ }).first()).toBeVisible();
});

test('from 1100 px the Stores panel is in the right rail, under it below the list', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  const rail = page.getByRole('complementary', { name: 'Manage stores' });
  await expect(rail.getByRole('heading', { name: 'Stores', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(rail).toHaveCount(0);
  const list = await page.locator('.gshoplist').boundingBox();
  const panel = await page.getByRole('heading', { name: 'Stores', exact: true }).boundingBox();
  expect(panel.y).toBeGreaterThan(list.y + list.height - 1);
});

test('no axe violations, 44 px targets and no sideways scroll at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await open(page);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => v.id)).toEqual([]);
  const small = await page.evaluate(() => [...document.querySelectorAll('.gstorechip, .gfold, .glistsum .btn')].filter(e => e.offsetParent).filter(e => e.getBoundingClientRect().height < 43.5).length);
  expect(small).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
