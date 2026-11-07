import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
// Shopping is one column under store chips since brief groceries-store-chips-owes (e2e/groceryStoreChips.spec.js covers it at three widths); the store columns stay on Bought and Inventory, which these tests cover.

// Shopping and Inventory: one column per store on a wide screen (3 from 1700px, 2 from 1100px, 1 below, never more columns than stores).
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
const cols = async page => page.evaluate(() => [...document.querySelectorAll('.gcols')].filter(e => e.offsetParent && !e.closest('details')).map(e => ({
  w: Math.round(e.getBoundingClientRect().width),
  tops: [...e.children].map(c => Math.round(c.getBoundingClientRect().top)),
  lefts: [...e.children].map(c => Math.round(c.getBoundingClientRect().left)),
  widths: [...e.children].map(c => Math.round(c.getBoundingClientRect().width)),
})));
const go = async (page, view) => { await page.click(`#groc-view-${view}`); };

test('Inventory lays its stores out as columns too, and the Tab order follows the columns', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page); await go(page, 'inventory');
  const [c] = await cols(page);
  expect(c.lefts.length).toBe(3);
  expect(new Set(c.tops).size).toBe(1);
  // Tab through the Have boxes: each box is in the column of the store before it in the list.
  const names = ['Olive oil', 'Rice', 'Toilet paper', 'Eggs', 'Milk', 'Salt']; // A to Z inside each store, store by store
  const xs = [];
  for (const n of names) xs.push((await box(page.getByLabel(`Have ${n}`))).x);
  expect(xs[0]).toBe(xs[1]); expect(xs[1]).toBe(xs[2]);
  expect(xs[3]).toBe(xs[4]); expect(xs[3]).toBeGreaterThan(xs[0]); expect(xs[5]).toBeGreaterThan(xs[3]);
  await page.getByLabel('Have Olive oil').focus();
  const order = [];
  for (let i = 0; i < 12 && order.length < 6; i++) { const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label')); if (label?.startsWith('Have ')) order.push(label); await page.keyboard.press('Tab'); } // a bought item's Last: line is a stop of its own; only the Have boxes are compared
  expect(order).toEqual(names.map(n => `Have ${n}`));
});

test('editing Inventory keeps the columns, with Show details inside each store and the Stores panel below', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page); await go(page, 'inventory');
  await page.click('#groc-edit');
  const [c] = await cols(page);
  expect(new Set(c.tops).size).toBe(1);
  await page.getByRole('button', { name: "Show details in BJ's" }).click();
  await expect(page.getByLabel('Note for Rice')).toBeVisible();
  const stores = await box(page.getByRole('heading', { name: 'Stores', exact: true }));
  expect(stores.x).toBeLessThan(c.lefts[1]);
});

test('a shared store keeps its group tag and money line inside its column', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, { ...CATALOGUE, groups: [{ id: 'g1', n: 'Run', people: [{ id: 'sis', n: 'Sister' }], stores: ["BJ's"] }] }, { lines: { tp: { got: true }, milk: { got: true } }, pulled: [] }); // two stores bought, so Bought has two columns
  await go(page, 'bought');
  const bj = page.locator('.gcols > .gstore', { hasText: "BJ's" }).first();
  await expect(bj.locator('.gtag')).toBeVisible();
  await expect(bj.locator('.gstoremoney')).toBeVisible();
  const [c] = await cols(page);
  const money = await box(bj.locator('.gstoremoney')); const colBox = await box(bj);
  expect(money.x + money.width).toBeLessThanOrEqual(colBox.x + colBox.width + 1);
  expect(c.lefts.length).toBeGreaterThan(1);
});

test('a store that only has a removed item\'s purchase still gets its column', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, { stores: ['Aldi', 'Costco'], items: [item('milk', 'Milk', 'Aldi', 399)] }, { lines: { milk: { got: true }, gone: { got: true, qty: 1, cents: 300, store: 'Costco' } }, pulled: [] });
  await go(page, 'bought'); // the purchase of a removed item shows on Bought
  const [c] = await cols(page);
  expect(c.lefts.length).toBe(2);
  expect(c.tops[0]).toBe(c.tops[1]);
  await expect(page.locator('.gcols > .gstore', { hasText: 'Bought here, then removed' })).toHaveCount(1);
});

test('the Bought view uses columns as well', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, CATALOGUE, { lines: { tp: { got: true }, milk: { got: true }, salt: { got: true } }, pulled: [] });
  await go(page, 'bought');
  const fold = await page.evaluate(() => [...document.querySelectorAll('.gcols > .gstore')].map(e => Math.round(e.getBoundingClientRect().left)));
  expect(fold.length).toBe(3);
  expect(new Set(fold).size).toBe(3);
});

test('no axe violations and 44px targets in both views at 1920', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page);
  for (const view of ['shopping', 'inventory']) {
    await go(page, view);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map(v => v.id)).toEqual([]);
    const small = await page.evaluate(() => [...document.querySelectorAll('.gcols button, .gcols .gtick, .gcols .gtickbox')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).filter(r => r.height < 43.5).length);
    expect(small).toBe(0);
  }
});
