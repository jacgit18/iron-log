import { test, expect } from './fixtures.js';

// Store chips, the desktop rail, the phone's total bar, Who owes who on Bought and the row-details default (brief groceries-store-chips-owes).
// A unit test cannot catch the layout at three widths, the sticky bar or the open-by-default panels. The fixed date is in September 2026.
const item = (id, n, store, cents = 300) => ({ id, n, store, qty: 1, cents, every: true, out: false });
const CATALOGUE = {
  stores: ['Costco', "Trader Joe's", 'Aldi'],
  items: [
    ...['Eggs', 'Chicken', 'Oil', 'Towels', 'Rice', 'Butter', 'Coffee', 'Soap', 'Pizza'].map(n => item(n.toLowerCase(), n, 'Costco', 900)),
    ...['Bananas', 'Berries', 'Hummus'].map(n => item(n.toLowerCase(), n, "Trader Joe's", 400)),
    item('milk', 'Milk', 'Aldi', 379),
  ],
  groups: [{ id: 'g1', n: 'Home', people: [{ id: 'sam', n: 'Sam' }, { id: 'alex', n: 'Alex' }], stores: ['Costco'] }],
};
const MONTH = { lines: { eggs: { got: true } }, pulled: [] };
const open = async (page, month = MONTH, catalogue = CATALOGUE) => {
  await page.evaluate(({ catalogue, month }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(catalogue));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(month));
    localStorage.setItem('ironlog:sort:grocery-details', 'auto'); // the default by screen size, not the closed rows the other specs pin
  }, { catalogue, month });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
};
const chip = (page, name) => page.getByRole('group', { name: 'Store' }).getByRole('button', { name });
const stores = page => page.locator('.gshoplist > .gstore');

test('chips filter to one store, All shows one column, and no store leaves an empty block at 390, 1280 and 1920', async ({ page }) => {
  await open(page);
  await expect(chip(page, /^All 12/)).toBeVisible(); // eggs is bought, so 12 of the 13 are still to get
  await expect(chip(page, /^Costco 8/)).toBeVisible();
  await expect(chip(page, /^Trader Joe's 3/)).toBeVisible();
  await expect(chip(page, /^Aldi 1/)).toBeVisible();
  await expect(stores(page)).toHaveCount(3);
  for (const [w, h] of [[390, 844], [1280, 800], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h });
    const lefts = await stores(page).evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(lefts).size, `one column at ${w}`).toBe(1); // stacked, not side by side with gaps
  }
  await chip(page, /^Costco/).click();
  await expect(stores(page)).toHaveCount(1);
  await expect(page.locator('.gshoplist')).toHaveClass(/gcompact/);
  await chip(page, /^All/).click();
  await expect(stores(page)).toHaveCount(3);
});

test('a chip whose store has nothing left falls back to All, and leaving the view resets it', async ({ page }) => {
  await open(page);
  await chip(page, /^Aldi/).click();
  await page.getByLabel('Have Milk').click();
  await expect(stores(page)).toHaveCount(2); // Aldi is gone, All is back
  await expect(chip(page, /^All/)).toHaveAttribute('aria-pressed', 'true');
  await chip(page, /^Costco/).click();
  await page.click('#groc-view-inventory'); await page.click('#groc-view-shopping');
  await expect(chip(page, /^All/)).toHaveAttribute('aria-pressed', 'true');
});

test('Who owes who is the first row on Bought and is not on Shopping', async ({ page }) => {
  await open(page, { lines: { eggs: { got: true }, chicken: { got: true } }, pulled: [] });
  await expect(page.locator('.gsplittoggle')).toHaveCount(0);
  await expect(page.locator('#groc-money')).toHaveCount(0);
  await page.click('#groc-view-bought');
  const row = page.locator('.gsplittoggle');
  await expect(row).toBeVisible();
  await expect(row).toContainText('Who owes who');
  await expect(row).toHaveAttribute('aria-expanded', 'false');
  const firstTop = await row.evaluate(e => Math.round(e.getBoundingClientRect().top));
  expect(firstTop).toBeLessThan(await page.locator('#groc-month').evaluate(e => Math.round(e.getBoundingClientRect().top))); // above the month line
  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
});

test('from 1100 px a rail holds the summary and a Stores list that picks the chip; under it there is no rail', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  const rail = page.getByRole('complementary', { name: 'This month' });
  await expect(rail).toBeVisible();
  await expect(rail.locator('#groc-summary')).toContainText('Bought 1 of 13');
  await rail.getByRole('button', { name: /^Costco/ }).click();
  await expect(stores(page)).toHaveCount(1);
  await expect(page.locator('#groc-summary')).toHaveCount(1); // one summary on the page
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(rail).toHaveCount(0);
  await expect(page.locator('#groc-summary')).toContainText('Bought 1 of 13');
});

test('a phone has a sticky total bar above the tab bar and no summary card; the Undo notice sits with it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await open(page);
  const bar = page.locator('.gtotalbar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('Bought 1 of 13');
  await expect(page.locator('.gsum')).toHaveCount(0);
  await page.getByLabel('Have Milk').click();
  await expect(page.locator('.gtickednote')).toContainText('Bought Milk.');
  await expect(bar).toContainText('Bought 2 of 13');
  const b = await bar.boundingBox(); const n = await page.locator('.gtickednote').boundingBox();
  expect(n.y + n.height).toBeLessThanOrEqual(b.y + 1); // the notice is above the bar, not under it
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(wide).toBe(false);
});

test('row details start open on a computer and closed on a phone, and the More menu choice is remembered', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await expect(page.getByLabel('Count of Chicken')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Count of Chicken')).toHaveCount(0);
  await page.click('#groc-details-all'); // Show details on all rows (the button above the list)
  await expect(page.getByLabel('Count of Chicken')).toBeVisible();
  await page.reload(); await page.click('#tab-daily'); await page.click('#daily-grocery');
  await expect(page.getByLabel('Count of Chicken')).toBeVisible(); // remembered on this device
});

test('a bought row with no price says Add price, and the tick notice offers it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { lines: {}, pulled: [] }, { stores: ['Aldi'], items: [{ id: 'milk', n: 'Milk', store: 'Aldi', qty: 1, cents: null, every: true, out: false }] });
  await page.getByLabel('Have Milk').click();
  const note = page.locator('.gtickednote');
  await expect(note).toContainText('It has no price yet.');
  await note.getByRole('button', { name: 'Add price' }).click();
  await expect(page).toHaveURL(/#\/daily\/grocery\/bought$/);
  await expect(page.getByLabel('Price each of Milk, dollars')).toBeVisible(); // its panel is open
  await expect(page.getByLabel('Price each of Milk, dollars')).toBeFocused(); // and the price box has focus
  await expect(page.getByRole('button', { name: /^Add price/ }).first()).toBeVisible();
});

test('moving a row to another store while a chip is on switches to All and keeps focus on the store box', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await chip(page, /^Costco/).click();
  await page.getByLabel('Store for Chicken this month').selectOption('Aldi');
  await expect(chip(page, /^All/)).toHaveAttribute('aria-pressed', 'true'); // the row is not lost: All shows it under Aldi
  await expect(page.locator('#groc-store-chicken')).toBeFocused();
  await expect(page.locator('#groc-store-chicken')).toHaveValue('Aldi');
});

test('the More menu can go back to details by screen size after a choice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.click('#groc-details-all');
  await expect(page.getByLabel('Count of Chicken')).toBeVisible();
  await page.click('#groc-toolmore');
  await page.click('#groc-details-auto');
  await expect(page.getByLabel('Count of Chicken')).toHaveCount(0); // a phone is closed again
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByLabel('Count of Chicken')).toBeVisible(); // and a computer is open
});
