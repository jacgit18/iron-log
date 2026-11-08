import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
// Shopping is one column under store chips since brief groceries-store-chips-owes (e2e/groceryStoreChips.spec.js covers it at three widths); Bought and Inventory (not editing) followed in brief
// groceries-bought-inventory-lists (e2e/groceryBoughtList.spec.js covers their chips and rail). Inventory's Edit mode followed in brief groceries-inventory-edit-list (e2e/groceryEditList.spec.js replaces the Edit-mode columns test that was here);
// the tests below check the one-column list.

// The fixed date is in September 2026. Three stores of different length; Aldi has one item bought.
const item = (id, n, store, cents, over = {}) => ({ id, n, store, qty: 1, cents, every: true, out: false, ...over });
const CATALOGUE = {
  stores: ["BJ's", 'Aldi', 'Costco'],
  items: [
    item('tp', 'Toilet paper', "BJ's", 2499), item('rice', 'Rice', "BJ's", 500), item('oil', 'Olive oil', "BJ's", 899),
    item('milk', 'Milk', 'Aldi', 399), item('eggs', 'Eggs', 'Aldi', 450),
    item('salt', 'Salt', 'Costco', 150),
  ],
};
const MONTH = { lines: { eggs: { got: true, qty: 1, cents: 450 }, gone: { got: true, qty: 1, cents: 300, store: 'Aldi' } }, pulled: [] };
const seed = async (page, cat = CATALOGUE, month = MONTH) => {
  await page.evaluate(({ cat, month }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(cat));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(month));
  }, { cat, month });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
};
const box = async loc => (await loc.boundingBox());
const stack = async page => page.evaluate(() => [...document.querySelectorAll('.gshoplist')].filter(e => e.offsetParent).map(e => ({
  lefts: [...e.children].map(c => Math.round(c.getBoundingClientRect().left)),
  tops: [...e.children].map(c => Math.round(c.getBoundingClientRect().top)),
})));
const go = async (page, view) => { await page.click(`#groc-view-${view}`); };

test('Inventory shows its stores in one column, and the Tab order follows the list', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page); await go(page, 'inventory');
  const [c] = await stack(page);
  expect(c.lefts.length).toBe(3);
  expect(new Set(c.lefts).size).toBe(1); // one column
  expect(c.tops).toEqual([...c.tops].sort((x, y) => x - y)); // stacked in order
  const names = ['Olive oil', 'Rice', 'Toilet paper', 'Eggs', 'Milk', 'Salt']; // A to Z inside each store, store by store
  const ys = [];
  for (const n of names) ys.push((await box(page.getByLabel(`Have ${n}`))).y);
  expect(ys).toEqual([...ys].sort((x, y) => x - y));
  await page.getByLabel('Have Olive oil').focus();
  const order = [];
  for (let i = 0; i < 12 && order.length < 6; i++) { const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label')); if (label?.startsWith('Have ')) order.push(label); await page.keyboard.press('Tab'); } // a bought item's Last: line is a stop of its own; only the Have boxes are compared
  expect(order).toEqual(names.map(n => `Have ${n}`));
});

test('a shared store keeps its group tag and money line inside its section on Bought', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, { ...CATALOGUE, groups: [{ id: 'g1', n: 'Run', people: [{ id: 'sis', n: 'Sister' }], stores: ["BJ's"] }] }, { lines: { tp: { got: true }, milk: { got: true } }, pulled: [] }); // two stores bought, so Bought has two columns
  await go(page, 'bought');
  const bj = page.locator('.gshoplist > .gstore', { hasText: "BJ's" }).first();
  await expect(bj.locator('.gtag')).toBeVisible();
  await expect(bj.locator('.gstoremoney')).toBeVisible();
  const [c] = await stack(page);
  const money = await box(bj.locator('.gstoremoney')); const colBox = await box(bj);
  expect(money.x + money.width).toBeLessThanOrEqual(colBox.x + colBox.width + 1);
  expect(c.lefts.length).toBeGreaterThan(1); // two stores, stacked
});

test('a store that only has a removed item\'s purchase still gets its section', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, { stores: ['Aldi', 'Costco'], items: [item('milk', 'Milk', 'Aldi', 399)] }, { lines: { milk: { got: true }, gone: { got: true, qty: 1, cents: 300, store: 'Costco' } }, pulled: [] });
  await go(page, 'bought'); // the purchase of a removed item shows on Bought
  const [c] = await stack(page);
  expect(c.lefts.length).toBe(2);
  expect(c.lefts[0]).toBe(c.lefts[1]); // one column
  await expect(page.locator('.gshoplist > .gstore', { hasText: 'Bought here, then removed' })).toHaveCount(1);
});

test('the Bought view is one column of store sections as well', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, CATALOGUE, { lines: { tp: { got: true }, milk: { got: true }, salt: { got: true } }, pulled: [] });
  await go(page, 'bought');
  const [c] = await stack(page);
  expect(c.lefts.length).toBe(3);
  expect(new Set(c.lefts).size).toBe(1);
});

test('no axe violations and 44px targets in both views at 1920', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page);
  for (const view of ['shopping', 'inventory']) {
    await go(page, view);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map(v => v.id)).toEqual([]);
    const small = await page.evaluate(() => [...document.querySelectorAll('.gshoplist button, .gshoplist .gtick, .gshoplist .gtickbox')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).filter(r => r.height < 43.5).length);
    expect(small).toBe(0);
  }
});
