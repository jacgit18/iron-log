import { test, expect } from './fixtures.js';

// A render error shows a way out instead of a white screen (backlog #71). The error is forced by making Array.prototype.sort throw while
// the Progress tab draws, then letting it work again.
// Armed and clicked in one step, so nothing else (the Board, a timer) can draw while sort is broken before Progress does.
const breakProgress = page => page.evaluate(() => {
  const sort = Array.prototype.sort;
  Array.prototype.sort = function (...a) { if (window.__crash) throw new Error('test crash'); return sort.apply(this, a); };
  window.__crash = true;
  document.getElementById('tab-progress').click();
});

test('an error in one tab keeps the header and tabs, and Try again redraws it', async ({ page }) => {
  await breakProgress(page);
  const crash = page.locator('#view .crash');
  await expect(crash).toBeVisible();
  await expect(crash.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
  await expect(crash.getByRole('button', { name: 'Export all data' })).toBeVisible();
  await expect(crash.getByRole('link', { name: 'Report the problem' })).toHaveAttribute('href', /^https:\/\/docs\.google\.com\/forms\//);
  await crash.getByText('Error details').click();
  await expect(crash).toContainText('test crash');
  await expect(page.locator('#tab-board')).toBeVisible();

  await page.evaluate(() => { window.__crash = false; });
  await crash.getByRole('button', { name: 'Try again' }).click();
  await expect(crash).toHaveCount(0);
  await expect(page.locator('#view')).toContainText('Weekly history');
});

test('another tab works after one has failed', async ({ page }) => {
  await breakProgress(page);
  await expect(page.locator('#view .crash')).toBeVisible();
  await page.evaluate(() => { window.__crash = false; });
  await page.locator('#tab-settings, #account-badge').first().click();
  await expect(page.locator('#view .crash')).toHaveCount(0);
  await expect(page.locator('#view')).toContainText('Export all data');
});
