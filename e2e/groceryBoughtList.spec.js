import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Bought and Inventory read like Shopping (brief groceries-bought-inventory-lists): store chips over one single-column list, no money line under the month switcher,
// and a rail from 1100 px. A unit test cannot catch the layout at three widths, the rail or that Edit mode has no columns. The fixed date is in September 2026.
const item = (id, n, store, cents = 300) => ({ id, n, store, qty: 1, cents, every: true, out: false });
const CATALOGUE = {
  stores: ['Costco', "Trader Joe's", 'Aldi'],
  items: [
    ...['Eggs', 'Chicken', 'Oil', 'Towels'].map(n => item(n.toLowerCase(), n, 'Costco', 900)),
    ...['Bananas', 'Berries'].map(n => item(n.toLowerCase(), n, "Trader Joe's", 400)),
    item('milk', 'Milk', 'Aldi', 379),
  ],
  groups: [{ id: 'g1', n: 'Home', people: [{ id: 'sam', n: 'Sam' }], stores: ['Costco'] }],
};
// Eggs and Chicken from Costco, Bananas from Trader Joe's and Milk from Aldi are bought.
const MONTH = { lines: { eggs: { got: true }, chicken: { got: true }, bananas: { got: true }, milk: { got: true } }, pulled: [] };
const open = async (page, view, month = MONTH) => {
  await page.evaluate(({ month, catalogue }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(catalogue));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(month));
    localStorage.setItem('ironlog:sort:grocery-details', 'closed');
  }, { month, catalogue: CATALOGUE });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click(`#groc-view-${view}`);
};
const chip = (page, name) => page.getByRole('group', { name: 'Store' }).getByRole('button', { name });
const stores = page => page.locator('.gshoplist > .gstore');
const WIDTHS = [[390, 844], [1280, 800], [1920, 1080]];

test('Bought has no money line; Who owes who is the first row; chips show one store in one column at 390, 1280 and 1920', async ({ page }) => {
  await open(page, 'bought');
  await expect(page.locator('#groc-money')).toHaveCount(0);
  const row = page.locator('.gsplittoggle');
  await expect(row).toContainText('Who owes who');
  await expect(row).toHaveAttribute('aria-expanded', 'false');
  await expect(chip(page, /^All 4/)).toBeVisible();
  await expect(chip(page, /^Costco 2/)).toBeVisible();
  await expect(chip(page, /^Trader Joe's 1/)).toBeVisible();
  await expect(chip(page, /^Aldi 1/)).toBeVisible();
  await expect(stores(page)).toHaveCount(3);
  await expect(page.locator('.gcols')).toHaveCount(0);
  for (const [w, h] of WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    const lefts = await stores(page).evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(lefts).size, `one column at ${w}`).toBe(1);
  }
  await chip(page, /^Costco/).click();
  await expect(stores(page)).toHaveCount(1);
  await expect(page.locator('.gshoplist')).toHaveClass(/gcompact/);
  await expect(page.getByLabel('Got Eggs')).toBeVisible();
  await chip(page, /^All/).click();
  await expect(stores(page)).toHaveCount(3);
});

test('the paid, share and owed numbers are still in the Who owes who card', async ({ page }) => {
  await open(page, 'bought');
  await page.locator('.gsplittoggle').click();
  const split = page.getByRole('region', { name: 'Who owes who' });
  for (const name of ['Paid', 'Your share', 'Still owed to you']) await expect(split.getByRole('term').filter({ hasText: new RegExp(`^${name}$`) })).toBeVisible();
});

test('on Bought a chip falls back to All when its last row is put back, leaving the view resets it, and search and Select work inside a chip', async ({ page }) => {
  await open(page, 'bought');
  await chip(page, /^Aldi/).click();
  await expect(stores(page)).toHaveCount(1);
  await page.getByLabel('Got Milk').click(); // put back
  await expect(stores(page)).toHaveCount(2); // Aldi is gone, All is back
  await expect(chip(page, /^All/)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.gtickednote')).toHaveCount(0); // putting back is not a tick, so no Undo notice (it was a Shopping tick)
  await chip(page, /^Costco/).click();
  await page.getByLabel('Search groceries').fill('chick');
  await expect(page.locator('.gshoplist li')).toHaveCount(1);
  await expect(chip(page, /^Costco 2/)).toBeVisible(); // counts ignore the search
  await page.getByLabel('Search groceries').fill('');
  await page.getByRole('button', { name: 'Select items' }).click();
  await expect(page.getByLabel('Select Eggs')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.click('#groc-view-shopping'); await page.click('#groc-view-bought');
  await expect(chip(page, /^All/)).toHaveAttribute('aria-pressed', 'true');
});

test('Inventory shows chips with item counts and one column with ticks, the Bought tag and "n items · m you have"; Edit keeps the chips and the one column (groceryEditList.spec.js has the detail)', async ({ page }) => {
  await open(page, 'inventory');
  await expect(chip(page, /^All 7/)).toBeVisible();
  await expect(chip(page, /^Costco 4/)).toBeVisible();
  await expect(chip(page, /^Trader Joe's 2/)).toBeVisible();
  await expect(chip(page, /^Aldi 1/)).toBeVisible();
  await expect(stores(page)).toHaveCount(3);
  await expect(page.locator('.gcols')).toHaveCount(0);
  await expect(page.locator('section.gstore', { has: page.getByRole('heading', { name: /Costco/ }) })).toContainText('4 items · 2 you have'); // eggs and chicken are bought, so had
  await expect(page.locator('section.gstore', { has: page.getByRole('heading', { name: /Aldi/ }) })).toContainText('1 item · 1 you have');
  await expect(page.getByLabel('Have Eggs')).toBeChecked();
  await expect(page.getByLabel('Have Oil')).not.toBeChecked();
  await expect(page.locator('.gchip', { hasText: 'Bought' })).toHaveCount(4);
  for (const [w, h] of WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    const lefts = await stores(page).evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(lefts).size, `one column at ${w}`).toBe(1);
  }
  await chip(page, /^Costco/).click();
  await expect(stores(page)).toHaveCount(1);
  await page.getByLabel('Have Oil').click(); // a tick still works inside a chip
  await expect(page.getByLabel('Have Oil')).toBeChecked();
  await expect(page.locator('section.gstore')).toContainText('4 items · 3 you have');
  await page.click('#groc-edit');
  await expect(page.locator('.gstorechips')).toBeVisible();
  await expect(page.locator('.gcols')).toHaveCount(0);
  await expect(page.locator('.gshoplist')).toHaveCount(1);
  await expect(page.getByRole('complementary', { name: 'Inventory' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).first().click();
  await expect(page.locator('.gstorechips')).toBeVisible();
});

test('from 1100 px a rail lists the stores and picks the chip on Bought and Inventory; under it there is no rail', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, 'bought');
  const rail = page.getByRole('complementary', { name: 'This month' });
  await expect(rail.getByRole('button', { name: /^Costco/ })).toBeVisible();
  await rail.getByRole('button', { name: /^Costco/ }).click();
  await expect(stores(page)).toHaveCount(1);
  await expect(chip(page, /^Costco/)).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(rail).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click('#groc-view-inventory');
  const inv = page.getByRole('complementary', { name: 'Inventory' });
  await expect(inv.locator('#groc-inv-have')).toHaveText('4 of 7 items this month');
  await expect(inv.getByRole('button', { name: /^Costco\s*4/ })).toBeVisible();
  await inv.getByRole('button', { name: /^Aldi/ }).click();
  await expect(stores(page)).toHaveCount(1);
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(inv).toHaveCount(0);
});

test('Spending history is still one tap away inside Bought', async ({ page }) => {
  await open(page, 'bought');
  await page.click('#groc-bought-history');
  await expect(page).toHaveURL(/#\/daily\/grocery\/bought\/history/);
  await expect(page.locator('.gstorechips')).toHaveCount(0);
  await page.click('#groc-bought-month');
  await expect(chip(page, /^All 4/)).toBeVisible();
});

test('Bought and Inventory with chips have no accessibility violations in both themes and 44px targets', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const view of ['bought', 'inventory']) {
    await open(page, view);
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme });
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
    }
    const small = await page.evaluate(() => [...document.querySelectorAll('.gstorechip, .grailstore, .gshoplist .gtickbox, .gshoplist .gtick')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).filter(r => r.height < 43.5).length);
    expect(small).toBe(0);
  }
});
