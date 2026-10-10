import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
const open = async page => { await page.click('#tab-daily'); await page.click('#daily-grocery'); };
const asAdmin = async page => { await page.evaluate(() => localStorage.setItem('ironlog:session/admin', 'true')); await page.reload(); };
const add = async (page, n, store, qty, price, once = false) => {
  await page.fill('#groc-name', n); await page.fill('#groc-store', store); await page.fill('#groc-qty', qty); await page.fill('#groc-price', price);
  if (once) await page.check('#groc-once');
  await page.click('#groc-add');
  await expect(page.locator('#groc-name')).toHaveValue('');
};

test('Groceries is not on the Daily tab for anyone but an admin', async ({ page }) => {
  await page.click('#tab-daily');
  await expect(page.locator('#daily-supplements')).toBeVisible();
  await expect(page.locator('#daily-grocery')).toHaveCount(0);
});

test('an admin builds a list across stores, ticks it off, sees the totals, and keeps it after a reload', async ({ page }) => {
  await asAdmin(page); await open(page);
  await expect(page.locator('#groc-month')).toContainText('September 2026');
  await page.click('#groc-edit');
  await add(page, 'Kale', 'Veg market', '2', '2.50');
  await add(page, 'Rice', 'Costco', '1', '18.99');
  await add(page, 'Saffron', 'Costco', '1', '12', true);
  await page.click('#groc-edit');
  await expect(page.locator('#groc-summary')).toHaveText('Got 0 of 2 · Spent $0.00 · Expected $23.99');
  await expect(page.getByRole('group', { name: 'Veg market' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Occasional' })).toContainText('Saffron');
  await page.check('#groc-kale');
  await page.getByLabel('Count of Kale').fill('4'); await page.getByLabel('Count of Kale').blur();
  await expect(page.locator('#groc-summary')).toHaveText('Got 1 of 2 · Spent $10.00 · Expected $28.99');
  await page.getByRole('button', { name: 'Add Saffron to this month' }).click();
  await expect(page.locator('#groc-summary')).toContainText('Got 1 of 3');
  await page.reload(); await open(page);
  await expect(page.locator('#groc-kale')).toBeChecked();
  await expect(page.getByLabel('Count of Kale')).toHaveValue('4');
  await expect(page.locator('#groc-summary')).toContainText('Got 1 of 3');
});

test('the next month starts fresh with the same items, and the price typed is remembered', async ({ page }) => {
  await asAdmin(page); await open(page);
  await page.click('#groc-edit');
  await add(page, 'Kale', 'Veg market', '2', '2.50');
  await page.click('#groc-edit');
  await page.check('#groc-kale');
  await page.getByLabel('Price each of Kale, dollars').fill('3.10'); await page.getByLabel('Price each of Kale, dollars').blur();
  await expect(page.locator('#groc-summary')).toHaveText('Got 1 of 1 · Spent $6.20 · Expected $6.20');
  await page.clock.setFixedTime(new Date('2026-10-02T12:00:00-04:00'));
  await page.reload(); await open(page);
  await expect(page.locator('#groc-month')).toContainText('October 2026');
  await expect(page.locator('#groc-kale')).not.toBeChecked();
  await expect(page.getByLabel('Price each of Kale, dollars')).toHaveValue('3.10');
  await page.click('#groc-prev');
  await expect(page.locator('#groc-month')).toContainText('September 2026');
  await expect(page.locator('#groc-kale')).toBeChecked();
});

test('the list has no accessibility violations, reading or editing', async ({ page }) => {
  await asAdmin(page); await open(page);
  await page.click('#groc-edit');
  await add(page, 'Kale', 'Veg market', '2', '2.50');
  await add(page, 'Saffron', '', '1', '', true);
  let { violations } = await scan(page);
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  await page.click('#groc-edit');
  ({ violations } = await scan(page));
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
});

test('Groceries comes before Supplements, and the store lists offer the suggested stores', async ({ page }) => {
  await asAdmin(page);
  await page.click('#tab-daily');
  const ids = await page.locator('[aria-label="Daily section"] button').evaluateAll(b => b.map(x => x.id));
  expect(ids).toEqual(['daily-grocery', 'daily-supplements', 'daily-medical']);
  await expect(page.locator('#daily-supplements')).toHaveAttribute('aria-pressed', 'true'); // Supplements still opens first
  await page.click('#daily-grocery');
  await page.click('#groc-edit');
  await expect(page.locator('#groc-stores option')).toHaveCount(5);
  await page.fill('#groc-name', 'Bananas'); await page.fill('#groc-store', 'Aldi'); await page.click('#groc-add');
  await expect(page.locator('#groc-stores option')).toHaveCount(5); // Aldi is now one of yours, not listed twice
  await page.getByLabel('Store for Bananas').selectOption("BJ's");
  await page.click('#groc-edit');
  await expect(page.getByRole('group', { name: "BJ's" })).toContainText('Bananas');
});
