import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
const noViolations = async page => {
  const { violations } = await scan(page);
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
};
const open = async page => { await page.click('#tab-daily'); await page.click('#daily-grocery'); };
// Adds an item from At home's Edit mode (left open). `every`: an Every-month item, else When out (the default).
const add = async (page, n, store, qty, price, every = false) => {
  await page.fill('#groc-name', n); await page.fill('#groc-store', store); await page.fill('#groc-qty', qty); await page.fill('#groc-price', price);
  await page.setChecked('#groc-every', every);
  await page.click('#groc-add');
  await expect(page.locator('#groc-name')).toHaveValue('');
};
const editing = async page => { await page.click('#groc-view-home'); await page.click('#groc-edit'); };
const done = async page => { await page.click('#groc-edit'); };

test('Groceries is on the Daily tab for everyone, opens on At home while empty, and has no device-only notice', async ({ page }) => {
  await open(page); // not an admin
  await expect(page.locator('#groc-h')).toBeVisible();
  await expect(page.locator('#groc-view-home')).toHaveAttribute('aria-pressed', 'true');
  // With syncing off everything is kept in this browser, the list like the rest, so it needs no notice of its own (ADR 039).
  await expect(page.getByText('On this device only')).toHaveCount(0);
});

test('unchecking an item at home puts it on To get; ticking it bought checks it at home again', async ({ page }) => {
  await open(page);
  await editing(page);
  await add(page, 'Kale', 'Veg market', '2', '2.50');
  await add(page, 'Rice', 'Costco', '1', '18.99', true);
  await done(page);
  await expect(page.getByRole('group', { name: 'Grocery view' })).toBeVisible();
  await expect(page.getByLabel('Have Kale')).toBeChecked();
  await expect(page.getByRole('region', { name: 'Costco' })).toContainText('Every month'); // Rice: a chip, no checkbox
  await expect(page.getByLabel('Have Rice')).toHaveCount(0);
  await page.click('#groc-view-get');
  await expect(page.locator('#groc-month')).toContainText('September 2026');
  await expect(page.locator('#groc-summary')).toHaveText('Got 0 of 1 · Spent $0.00 · Expected $18.99'); // only the Every-month item
  await page.click('#groc-view-home');
  await page.getByLabel('Have Kale').uncheck();
  await page.click('#groc-view-get');
  await expect(page.locator('#groc-summary')).toHaveText('Got 0 of 2 · Spent $0.00 · Expected $23.99');
  await expect(page.getByRole('region', { name: 'Veg market' })).toContainText('Kale');
  await page.getByText('Kale', { exact: true }).click(); // the whole row ticks it
  await expect(page.locator('#groc-kale')).toBeChecked();
  await expect(page.locator('#groc-summary')).toHaveText('Got 1 of 2 · Spent $5.00 · Expected $23.99');
  await page.click('#groc-view-home');
  await expect(page.getByLabel('Have Kale')).toBeChecked(); // bought: you have it again
  await page.click('#groc-view-get');
  await expect(page.getByRole('region', { name: 'Veg market' })).toContainText('Kale'); // and it stays on this month as bought
  await page.locator('#groc-kale').uncheck();
  await page.click('#groc-view-home');
  await expect(page.getByLabel('Have Kale')).not.toBeChecked(); // unticked: out again
  await page.reload(); await open(page);
  await expect(page.locator('#groc-view-get')).toHaveAttribute('aria-pressed', 'true'); // a list with items opens on To get
  await expect(page.locator('#groc-summary')).toContainText('Got 0 of 2');
});

test('the count and price open from the row, and a When-out item can be taken off the list', async ({ page }) => {
  await open(page);
  await editing(page);
  await add(page, 'Kale', 'Veg market', '2', '2.50');
  await add(page, 'Rice', 'Costco', '1', '18.99', true);
  await done(page);
  await page.getByLabel('Have Kale').uncheck();
  await page.click('#groc-view-get');
  await expect(page.getByLabel('Count of Kale')).toHaveCount(0); // closed until asked for
  const kale = page.getByRole('button', { name: 'Count and price of Kale' });
  await expect(kale).toHaveText('2 × $2.50');
  await kale.click();
  await expect(kale).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Count of Kale').fill('4'); await page.getByLabel('Count of Kale').blur();
  await expect(kale).toHaveText('4 × $2.50');
  await expect(page.locator('#groc-summary')).toHaveText('Got 0 of 2 · Spent $0.00 · Expected $28.99');
  await page.getByRole('button', { name: 'Count and price of Rice' }).click();
  await expect(page.getByRole('button', { name: 'Take Rice off the list' })).toHaveCount(0); // Every month stays on
  await page.getByRole('button', { name: 'Take Kale off the list' }).click();
  await expect(page.locator('#groc-summary')).toHaveText('Got 0 of 1 · Spent $0.00 · Expected $18.99');
  await page.click('#groc-view-home');
  await expect(page.getByLabel('Have Kale')).toBeChecked();
});

test('ticked items move below the rest of their store', async ({ page }) => {
  await open(page);
  await editing(page);
  await add(page, 'Apples', 'Market', '1', '', true);
  await add(page, 'Bread', 'Market', '1', '', true);
  await done(page);
  await page.click('#groc-view-get');
  const names = () => page.getByRole('region', { name: 'Market' }).locator('li').allTextContents();
  expect((await names()).map(t => t.split('1 ×')[0])).toEqual(['Apples', 'Bread']);
  await page.locator('#groc-apples').check();
  await expect.poll(async () => (await names()).map(t => t.split('1 ×')[0])).toEqual(['Bread', 'Apples']);
});

test('the next month starts fresh with the Every-month items and what is still out, and the price typed is remembered', async ({ page }) => {
  await open(page);
  await editing(page);
  await add(page, 'Kale', 'Veg market', '2', '2.50', true);
  await add(page, 'Saffron', 'Spice shop', '1', '12');
  await done(page);
  await page.getByLabel('Have Saffron').uncheck();
  await page.click('#groc-view-get');
  await page.locator('#groc-kale').check();
  await page.getByRole('button', { name: 'Count and price of Kale' }).click();
  await page.getByLabel('Price each of Kale, dollars').fill('3.10'); await page.getByLabel('Price each of Kale, dollars').blur();
  await expect(page.locator('#groc-summary')).toHaveText('Got 1 of 2 · Spent $6.20 · Expected $18.20');
  await page.clock.setFixedTime(new Date('2026-10-02T12:00:00-04:00'));
  await page.reload(); await open(page);
  await expect(page.locator('#groc-month')).toContainText('October 2026');
  await expect(page.locator('#groc-kale')).not.toBeChecked();
  await expect(page.locator('#groc-saffron')).not.toBeChecked(); // still out: still on the list
  await expect(page.getByRole('button', { name: 'Count and price of Kale' })).toHaveText('2 × $3.10');
  await page.click('#groc-prev');
  await expect(page.locator('#groc-month')).toContainText('September 2026');
  await expect(page.locator('#groc-kale')).toBeChecked();
  await expect(page.locator('#groc-saffron')).toHaveCount(0); // a past month shows what was bought, not what is out today
});

test('older lists still read: an occasional item becomes When out and not out', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ironlog:grocery/main', JSON.stringify({ stores: [], items: [
    { id: 'rice', n: 'Rice', store: '', qty: 1, cents: null, once: false },
    { id: 'saffron', n: 'Saffron', store: '', qty: 1, cents: null, once: true },
  ] })));
  await page.reload(); await open(page);
  await expect(page.locator('#groc-summary')).toContainText('Got 0 of 1');
  await page.click('#groc-view-home');
  await expect(page.getByLabel('Have Saffron')).toBeChecked();
  await expect(page.getByLabel('Have Rice')).toHaveCount(0);
});

test('both views have no accessibility violations, reading or editing', async ({ page }) => {
  await open(page);
  await editing(page);
  await add(page, 'Kale', 'Veg market', '2', '2.50');
  await add(page, 'Rice', '', '1', '', true);
  await noViolations(page); // At home, editing
  await done(page);
  await page.getByLabel('Have Kale').uncheck();
  await noViolations(page); // At home
  await page.click('#groc-view-get');
  await page.getByRole('button', { name: 'Count and price of Kale' }).click();
  await page.locator('#groc-rice').check();
  await noViolations(page); // To get, one row open, one ticked
});

test('Groceries comes before Supplements, and the store lists offer the suggested stores', async ({ page }) => {
  await page.click('#tab-daily');
  await expect(page.locator('#daily-grocery')).toBeVisible(); // the tab is its own chunk, fetched on first open
  const ids = await page.locator('[aria-label="Daily section"] button').evaluateAll(b => b.map(x => x.id));
  expect(ids).toEqual(['daily-grocery', 'daily-supplements', 'daily-medical']);
  await expect(page.locator('#daily-supplements')).toHaveAttribute('aria-pressed', 'true'); // Supplements still opens first
  await page.click('#daily-grocery');
  await page.click('#groc-edit'); // an empty list opens on At home
  await expect(page.locator('#groc-stores option')).toHaveCount(5);
  await page.fill('#groc-name', 'Bananas'); await page.fill('#groc-store', 'Aldi'); await page.click('#groc-add');
  await expect(page.locator('#groc-stores option')).toHaveCount(5); // Aldi is now one of yours, not listed twice
  await page.getByLabel('Store for Bananas').selectOption("BJ's");
  await done(page);
  await expect(page.getByRole('region', { name: "BJ's" })).toContainText('Bananas');
});
