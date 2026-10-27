import { test, expect } from './fixtures.js';

const open = async page => { await page.click('#tab-daily'); await page.click('#daily-grocery'); };
const add = async (page, n) => {
  await page.fill('#groc-name', n);
  await page.click('#groc-add');
  await expect(page.locator('#groc-name')).toHaveValue('');
};

test('a new month keeps the At home ticks, says so on To get, and a tick cleared stays cleared after a reload (ADR 079)', async ({ page }) => {
  await open(page);
  await page.click('#groc-edit');
  await add(page, 'Rice'); await add(page, 'Kale');
  await page.click('#groc-done');
  await page.getByLabel('Have Rice').check(); await page.getByLabel('Have Kale').check();
  await page.clock.setFixedTime(new Date('2026-10-02T12:00:00-04:00'));
  await page.reload(); await open(page);
  await expect(page.locator('#groc-month')).toContainText('October 2026');
  await page.click('#groc-view-get');
  await expect(page.locator('#groc-summary')).toContainText('Nothing on this month');
  await expect(page.locator('#groc-carried')).toHaveText('Carried over 2 items you still have from September 2026.');
  await page.click('#groc-view-home');
  await expect(page.getByLabel('Have Rice')).toBeChecked();
  await expect(page.getByLabel('Have Kale')).toBeChecked();
  await page.getByLabel('Have Rice').uncheck(); // ran out
  await page.click('#groc-view-get');
  await expect(page.locator('#groc-summary')).toContainText('Got 0 of 1');
  await expect(page.locator('#groc-carried')).toHaveText('Carried over 1 item you still have from September 2026.');
  await page.click('#groc-view-home');
  await page.getByLabel('Have Kale').uncheck(); // every tick cleared: the month must not be seeded again
  await page.reload(); await open(page);
  await page.click('#groc-view-home');
  await expect(page.getByLabel('Have Rice')).not.toBeChecked();
  await expect(page.getByLabel('Have Kale')).not.toBeChecked();
  await page.click('#groc-view-get');
  await expect(page.locator('#groc-carried')).toHaveCount(0);
});
