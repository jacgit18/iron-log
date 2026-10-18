import { test, expect } from './fixtures.js';

const open = async page => { await page.click('#tab-daily'); await page.click('#daily-grocery'); };

test('an item sold by the lb reads as a weight and a price per lb, and the total follows', async ({ page }) => {
  await open(page);
  await page.click('#groc-edit');
  await page.click('#groc-more');
  await page.selectOption('#groc-unit', 'lb');
  await expect(page.locator('#groc-qty')).toHaveAttribute('placeholder', 'Weight (lb)');
  await expect(page.locator('#groc-price')).toHaveAttribute('placeholder', 'Price per lb');
  await page.fill('#groc-name', 'Chicken'); await page.fill('#groc-qty', '2.4'); await page.fill('#groc-price', '6.25');
  await page.setChecked('#groc-every', true);
  await page.click('#groc-add');
  await page.click('#groc-done');
  await page.click('#groc-view-get');
  const pill = page.getByRole('button', { name: 'Weight (lb) and price of Chicken' });
  await expect(pill).toHaveText('2.4 lb × $6.25/lb');
  await expect(page.locator('#groc-summary')).toContainText('Expected $15.00');
  await pill.click();
  await page.getByLabel('Weight (lb) of Chicken').fill('3'); await page.getByLabel('Weight (lb) of Chicken').blur();
  await expect(page.getByLabel('Total for Chicken')).toHaveText('$18.75');
});

test('on a phone the open More panel stays short and its checkbox is a normal checkbox', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await page.click('#groc-edit');
  await page.click('#groc-more');
  const more = await page.locator('#groc-dock-more').boundingBox();
  expect(more.height).toBeLessThanOrEqual(812 * 0.3 + 1);
  const dock = await page.locator('.gdock').boundingBox();
  expect(dock.height).toBeLessThanOrEqual(812 * 0.45);
  const chk = await page.locator('#groc-every').boundingBox();
  expect(Math.abs(chk.width - chk.height)).toBeLessThanOrEqual(1); // square: it used to stretch into an oval
});
