import { test, expect } from './fixtures.js';

const open = async page => { await page.click('#tab-daily'); await page.click('#daily-grocery'); };

test('editing At home: the add form and Done float, an item takes a note, and the tick works without leaving Edit', async ({ page }) => {
  await open(page);
  await page.click('#groc-edit'); // an empty list opens on At home
  const dock = page.getByRole('region', { name: 'Add an item' });
  await expect(dock).toBeVisible();
  await page.click('#groc-more');
  await page.fill('#groc-name', 'Oat milk'); await page.fill('#groc-note', 'the barista one');
  await page.click('#groc-add');
  await expect(page.locator('#groc-name')).toHaveValue('');
  // still editing: the new When-out item has its own "have it" tick, and it moves the item onto To get
  await expect(page.getByLabel('Have Oat milk')).toBeChecked();
  await page.getByLabel('Have Oat milk').uncheck();
  await page.click('#groc-done');
  await expect(dock).toHaveCount(0);
  await expect(page.locator('.ghome')).toContainText('the barista one');
  await expect(page.locator('.ghome')).toContainText('On the list');
});

test('To get can go past this month to plan, and ticking is closed there', async ({ page }) => {
  await open(page);
  await page.click('#groc-edit');
  await page.click('#groc-more');
  await page.fill('#groc-name', 'Rice'); await page.setChecked('#groc-every', true); await page.click('#groc-add');
  await page.click('#groc-done');
  await page.click('#groc-view-get');
  await expect(page.locator('#groc-next')).toBeEnabled();
  await page.click('#groc-next');
  await expect(page.locator('#groc-month')).toContainText('(ahead)');
  await expect(page.locator('#groc-rice')).toBeDisabled();
  await page.click('#groc-prev');
  await expect(page.locator('#groc-month')).toContainText('(this month)');
  await expect(page.locator('#groc-rice')).toBeEnabled();
});

test('Spending shows a bar for a month you bought in, with the average as text', async ({ page }) => {
  await open(page);
  await page.click('#groc-edit');
  await page.click('#groc-more');
  await page.fill('#groc-name', 'Rice'); await page.fill('#groc-price', '10'); await page.setChecked('#groc-every', true); await page.click('#groc-add');
  await page.click('#groc-done');
  await page.click('#groc-view-get');
  await page.locator('#groc-rice').check();
  await page.click('#groc-view-spend');
  await expect(page.locator('#groc-spend-summary')).toContainText('Average $10.00 a month over 1 month');
  await expect(page.locator('.gbars li.cur')).toHaveAttribute('aria-label', /\$10\.00 on 1 item/);
});
