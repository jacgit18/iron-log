import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// To get and At home: one column per store on a wide screen (3 from 1700px, 2 from 1100px, 1 below, never more columns than stores).
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

test('1920 wide: To get shows one column per store, each with its heading, total and Expand all', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page); await go(page, 'get');
  const [c] = await cols(page);
  expect(c.lefts.length).toBe(3); // BJ's, Aldi, Costco
  const first3 = c.tops.slice(0, 3);
  expect(new Set(first3).size).toBe(1); // same row
  expect(c.lefts[0]).toBeLessThan(c.lefts[1]); expect(c.lefts[1]).toBeLessThan(c.lefts[2]);
  expect(c.widths[0]).toBeLessThan(700);
  const bj = page.locator('.gstore', { hasText: "BJ's" }).first();
  await expect(bj.locator('.gstoremeta .note')).toContainText('3 to get');
  await expect(bj.getByRole('button', { name: "Expand all in BJ's" })).toBeVisible();
  const head = await box(bj.locator('.gstorehead')); const col = await box(bj);
  expect(head.x).toBeGreaterThanOrEqual(col.x); expect(head.x + head.width).toBeLessThanOrEqual(col.x + col.width + 1);
});

test('the controls above the stores stay full width', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page); await go(page, 'get');
  const [c] = await cols(page);
  const bar = await box(page.locator('.gskiprow'));
  const top = await box(page.locator('#groc-summary'));
  expect(bar.y + bar.height).toBeLessThanOrEqual(c.tops[0] + 1);
  expect(top.y).toBeLessThan(c.tops[0]);
  const grid = await box(page.locator('.gcols').first());
  expect(bar.x + bar.width).toBeGreaterThan(grid.x + grid.width - 4); // Skip all sits at the right edge of the whole grid, not of one column
});

test('1280 wide has two columns and 375 wide has one', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seed(page); await go(page, 'get');
  let [c] = await cols(page);
  expect(c.tops[0]).toBe(c.tops[1]); expect(c.lefts[1]).toBeGreaterThan(c.lefts[0]);
  expect(c.tops[2]).toBeGreaterThan(c.tops[0]); // the third wraps
  await page.setViewportSize({ width: 375, height: 800 });
  [c] = await cols(page);
  expect(new Set(c.lefts).size).toBe(1); // stacked
  await page.setViewportSize({ width: 768, height: 900 });
  [c] = await cols(page);
  expect(new Set(c.lefts).size).toBe(1);
});

test('two stores at 1920 make two columns, not three with a hole', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, { stores: ['Aldi', 'Costco'], items: [item('milk', 'Milk', 'Aldi', 399), item('salt', 'Salt', 'Costco', 150)] }, { lines: {}, pulled: [] });
  await go(page, 'get');
  const [c] = await cols(page);
  expect(c.lefts.length).toBe(2);
  expect(c.widths[0]).toBeGreaterThan(800);
  expect(c.widths[0] + c.widths[1]).toBeGreaterThan(c.w - 40);
});

test('At home lays its stores out as columns too, and the Tab order follows the columns', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page); await go(page, 'home');
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
  for (let i = 0; i < 6; i++) { order.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))); await page.keyboard.press('Tab'); }
  expect(order).toEqual(names.map(n => `Have ${n}`));
});

test('editing At home keeps the columns, with Expand all inside each store and the Stores panel below', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page); await go(page, 'home');
  await page.click('#groc-edit');
  const [c] = await cols(page);
  expect(new Set(c.tops).size).toBe(1);
  await page.getByRole('button', { name: "Expand all in BJ's" }).click();
  await expect(page.getByLabel('Note for Rice')).toBeVisible();
  const stores = await box(page.getByRole('heading', { name: 'Stores', exact: true }));
  expect(stores.x).toBeLessThan(c.lefts[1]);
});

test('a shared store keeps its group tag and money line inside its column', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, { ...CATALOGUE, groups: [{ id: 'g1', n: 'Run', people: [{ id: 'sis', n: 'Sister' }], stores: ["BJ's"] }] }, { lines: { tp: { got: true } }, pulled: [] });
  await go(page, 'get');
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
  await seed(page, { stores: ['Aldi', 'Costco'], items: [item('milk', 'Milk', 'Aldi', 399)] }, { lines: { gone: { got: true, qty: 1, cents: 300, store: 'Costco' } }, pulled: [] });
  await go(page, 'get');
  const [c] = await cols(page);
  expect(c.lefts.length).toBe(2);
  expect(c.tops[0]).toBe(c.tops[1]);
  await expect(page.locator('.gcols > .gstore', { hasText: 'Bought here, then removed' })).toHaveCount(1);
});

test('the Bought this month fold uses columns as well', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, CATALOGUE, { lines: { tp: { got: true }, milk: { got: true }, salt: { got: true } }, pulled: [] });
  await go(page, 'get');
  await page.click('#groc-bought summary');
  const fold = await page.evaluate(() => [...document.querySelectorAll('#groc-bought .gcols > .gstore')].map(e => Math.round(e.getBoundingClientRect().left)));
  expect(fold.length).toBe(3);
  expect(new Set(fold).size).toBe(3);
});

test('no axe violations and 44px targets in both views at 1920', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page);
  for (const view of ['get', 'home']) {
    await go(page, view);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map(v => v.id)).toEqual([]);
    const small = await page.evaluate(() => [...document.querySelectorAll('.gcols button, .gcols .gtick, .gcols .gtickbox')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).filter(r => r.height < 43.5).length);
    expect(small).toBe(0);
  }
});
