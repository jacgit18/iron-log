import { test, expect } from './fixtures.js';

// The notices that answer an action (undo after an uncheck, move heads-up, order, Removed ...) float above the bottom bar on a
// phone, so they show where you are scrolled; wider screens keep them in the page flow.
const untick = async page => {
  const box = page.locator('.col.sel article.card > .row1 > input.chk').first();
  await box.check();
  await page.evaluate(() => window.scrollTo(0, 700));
  await box.uncheck();
};

test('on a phone the undo notice floats in view over the cards, above the bottom bar', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.locator('.col.sel article.card').first()).toBeVisible();
  await untick(page);
  const notice = page.locator('.toasts .notice');
  await expect(notice).toBeVisible();
  await expect(page.locator('.toasts')).toHaveCSS('position', 'fixed');
  const n = await notice.boundingBox();
  const bar = await page.locator('.tabs').boundingBox();
  expect(n.y).toBeGreaterThan(0);
  expect(n.y + n.height).toBeLessThanOrEqual(bar.y);
  await notice.getByRole('button', { name: 'Undo' }).click();
  await expect(notice).toHaveCount(0);
});

test('on a wide screen the undo notice stays in the page flow', async ({ page }) => {
  await untick(page);
  await expect(page.locator('.toasts')).toHaveCSS('display', 'contents');
  await expect(page.locator('.toasts .notice')).toBeVisible();
});
