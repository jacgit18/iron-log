import { test, expect } from './fixtures.js';

const open = async page => { await page.click('#tab-daily'); await page.click('#daily-grocery'); };

test('an item bought several times at different prices totals their sum, and a typed count goes back to one price', async ({ page }) => {
  await open(page);
  await page.click('#groc-edit');
  await page.fill('#groc-name', 'Beef'); await page.click('#groc-add');
  await page.click('#groc-done');
  await page.click('#groc-view-get');
  await page.getByRole('button', { name: 'Count and price of Beef' }).click();
  const prices = page.getByLabel('Price of each Beef, dollars, separated by commas');
  await prices.fill('8.99, 10.49 9.25'); await prices.blur();
  await expect(page.getByLabel('Total for Beef')).toHaveText('$28.73');
  await expect(page.getByRole('button', { name: 'Count and price of Beef' })).toHaveText('3 × avg $9.58');
  await expect(page.getByLabel('Count of Beef')).toHaveValue('3');
  await expect(page.locator('#groc-summary')).toContainText('Expected $28.73');
  await page.locator('#groc-beef').check(); // bought: the prices stay
  await expect(page.locator('#groc-alldone')).toBeVisible();
  await page.click('#groc-bought summary');
  await expect(page.getByLabel('Total for Beef')).toHaveText('$28.73');
  await page.reload(); await open(page); await page.click('#groc-view-get');
  await page.click('#groc-bought summary');
  await expect(page.getByRole('button', { name: 'Count and price of Beef' })).toHaveText('3 × avg $9.58');
  await page.getByRole('button', { name: 'Count and price of Beef' }).click(); // the panel closed with the reload
  await page.getByLabel('Count of Beef').fill('2'); await page.getByLabel('Count of Beef').blur();
  await expect(page.getByRole('button', { name: 'Count and price of Beef' })).toContainText('2 ×');
  await expect(page.getByRole('button', { name: 'Count and price of Beef' })).not.toContainText('avg');
});

test('a price list that is not prices is refused and nothing changes', async ({ page }) => {
  await open(page);
  await page.click('#groc-edit');
  await page.fill('#groc-name', 'Beef'); await page.click('#groc-add');
  await page.click('#groc-done');
  await page.click('#groc-view-get');
  await page.getByRole('button', { name: 'Count and price of Beef' }).click();
  const prices = page.getByLabel('Price of each Beef, dollars, separated by commas');
  await prices.fill('8.99, abc'); await prices.blur();
  await expect(prices).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Count and price of Beef' })).toHaveText('1 × no price');
});

test('the single price box is empty while each one has its own price, so the catalogue price is not mistaken for it', async ({ page }) => {
  await open(page);
  await page.click('#groc-edit');
  await page.fill('#groc-name', 'Beef'); await page.click('#groc-more'); await page.fill('#groc-price', '9'); await page.click('#groc-add');
  await page.click('#groc-done');
  await page.click('#groc-view-get');
  await page.getByRole('button', { name: 'Count and price of Beef' }).click();
  await expect(page.getByLabel('Price each of Beef, dollars')).toHaveValue('9.00');
  const prices = page.getByLabel('Price of each Beef, dollars, separated by commas');
  await prices.fill('8.99, 10.49'); await prices.blur();
  await expect(page.getByLabel('Price each of Beef, dollars')).toHaveValue('');
  await expect(page.getByLabel('Total for Beef')).toHaveText('$19.48');
});
