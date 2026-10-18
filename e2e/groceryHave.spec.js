import { test, expect } from './fixtures.js';

const open = async page => { await page.click('#tab-daily'); await page.click('#daily-grocery'); };
const add = async (page, n, every) => {
  await page.fill('#groc-name', n);
  if (every) { if (!(await page.locator('#groc-every').count())) await page.click('#groc-more'); await page.setChecked('#groc-every', true); }
  await page.click('#groc-add');
  await expect(page.locator('#groc-name')).toHaveValue('');
};

test('a tick on To get shows on At home, for Every-month and When-out items, and the other way round', async ({ page }) => {
  await open(page);
  await page.click('#groc-edit');
  await add(page, 'Rice', true);
  await add(page, 'Kale', false);
  await page.click('#groc-done');
  await page.getByLabel('Have Kale').uncheck(); // out: on To get
  await page.click('#groc-view-get');
  await page.locator('#groc-rice').check();
  await page.locator('#groc-kale').check();
  await page.click('#groc-view-home');
  await expect(page.getByLabel('Have Rice')).toBeChecked(); // an Every-month item bought this month
  await expect(page.getByLabel('Have Kale')).toBeChecked();
  // and from At home back to To get
  await page.getByLabel('Have Rice').uncheck();
  await page.click('#groc-view-get');
  await expect(page.locator('#groc-rice')).not.toBeChecked();
  await expect(page.locator('#groc-kale')).toBeChecked();
});
