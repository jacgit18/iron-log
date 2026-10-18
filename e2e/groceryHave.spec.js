import { test, expect } from './fixtures.js';

const open = async page => { await page.click('#tab-daily'); await page.click('#daily-grocery'); };
const add = async (page, n) => {
  await page.fill('#groc-name', n);
  await page.click('#groc-add');
  await expect(page.locator('#groc-name')).toHaveValue('');
};
const setup = async page => {
  await open(page);
  await page.click('#groc-edit');
  await add(page, 'Rice');
  await add(page, 'Kale');
  await page.click('#groc-done');
};

test('a Have tick at home takes the item off To get this month, and buying on To get checks it at home, both ways', async ({ page }) => {
  await setup(page);
  await page.getByLabel('Have Rice').check(); // at home: off this month's list
  await page.click('#groc-view-get');
  await expect(page.locator('#groc-rice')).toHaveCount(0);
  await expect(page.locator('#groc-kale')).toBeVisible();
  await expect(page.locator('#groc-summary')).toContainText('Got 0 of 1');
  await page.locator('#groc-kale').check(); // bought on To get
  await page.click('#groc-view-home');
  await expect(page.getByLabel('Have Kale')).toBeChecked(); // checked at home too
  await expect(page.getByLabel('Have Rice')).toBeChecked();
  await page.getByLabel('Have Rice').uncheck(); // and unticking at home puts it back on the list
  await page.click('#groc-view-get');
  await expect(page.locator('#groc-rice')).not.toBeChecked();
  await expect(page.locator('#groc-rice')).toBeVisible();
});

test('the Have ticks clear when the month changes: every item is back on the new month’s list', async ({ page }) => {
  await setup(page);
  await page.getByLabel('Have Rice').check(); await page.getByLabel('Have Kale').check();
  await page.click('#groc-view-get');
  await expect(page.locator('#groc-summary')).toContainText('Nothing on this month');
  await page.clock.setFixedTime(new Date('2026-10-02T12:00:00-04:00'));
  await page.reload(); await open(page);
  await expect(page.locator('#groc-month')).toContainText('October 2026');
  await expect(page.locator('#groc-summary')).toContainText('Got 0 of 2');
  await page.click('#groc-view-home');
  await expect(page.getByLabel('Have Rice')).not.toBeChecked();
  await expect(page.getByLabel('Have Kale')).not.toBeChecked();
});
