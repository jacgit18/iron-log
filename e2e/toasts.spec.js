import { test, expect } from './fixtures.js';

// The notices that answer an action (undo after an uncheck, move heads-up, order, Removed ..., the status line) float: above the
// bottom bar on a phone, in the bottom left corner on a wider screen, so they show where you are scrolled and never push the page.
const untick = async page => {
  const box = page.locator('.col.sel article.card input.chk.cardchk').first();
  await box.check();
  await page.evaluate(() => window.scrollTo(0, 700));
  await box.uncheck();
};

test('on a phone the undo notice floats in view over the cards, above the bottom bar', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.locator('.col.sel article.card').first()).toBeVisible();
  await untick(page);
  const notice = page.locator('.toasts .notice:not([data-kind="info"])');
  await expect(notice).toBeVisible();
  await expect(page.locator('.toasts')).toHaveCSS('position', 'fixed');
  const n = await notice.boundingBox();
  const bar = await page.locator('.tabs').boundingBox();
  expect(n.y).toBeGreaterThan(0);
  expect(n.y + n.height).toBeLessThanOrEqual(bar.y);
  // room is kept under the toast for cards scrolled or focused into view, and given back when it goes
  const pad = () => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom));
  const withToast = await pad();
  await notice.getByRole('button', { name: 'Undo' }).click();
  await expect(notice).toHaveCount(0);
  await page.locator('h1').click(); // the "Put back" line goes on the next tap
  await expect(page.locator('.toasts .notice')).toHaveCount(0);
  expect(withToast - (await pad())).toBeGreaterThanOrEqual(140);
});

test('on a wide screen the undo notice floats in the bottom left corner and does not move the page', async ({ page }) => {
  const box = page.locator('.col.sel article.card input.chk.cardchk').first();
  await box.check();
  const top = () => page.evaluate(() => document.querySelector('.board').getBoundingClientRect().top + window.scrollY);
  const before = await top();
  await box.uncheck();
  const notice = page.locator('.toasts .notice');
  await expect(notice).toBeVisible();
  await expect(page.locator('.toasts')).toHaveCSS('position', 'fixed');
  const n = await notice.boundingBox(); const vp = page.viewportSize();
  expect(n.x).toBeLessThan(vp.width / 2);
  expect(n.y + n.height).toBeLessThanOrEqual(vp.height);
  expect(await top()).toBe(before); // the cards did not move for it
});

test('the status line is an info notice, announced once and gone on the next tap', async ({ page }) => {
  await untick(page);
  await page.locator('.toasts .notice').getByRole('button', { name: 'Undo' }).click();
  const info = page.locator('.toasts .notice[data-kind="info"]');
  await expect(info).toContainText('Put back');
  await expect(page.locator('#live-status')).toContainText('Put back'); // the live region is the notice's own parent
  await page.locator('h1').click();
  await expect(info).toHaveCount(0);
  await expect(page.locator('#live-status')).toHaveText('');
});
