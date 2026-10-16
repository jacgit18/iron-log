import { test, expect } from './fixtures.js';

// A swap of two days is easy to miss: the two days it changed are outlined for about two seconds (and the Board brings the day it moved
// to into view), on top of the status line that names them.
test('swapping two days outlines both for a moment, on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await expect(page.locator('.col.swapped')).toHaveCount(0);
  await page.locator('#swap-2-1').click();
  await expect(page.locator('#col-2')).toHaveClass(/swapped/);
  await expect(page.locator('#col-3')).toHaveClass(/swapped/);
  await expect(page.locator('.col.swapped')).toHaveCount(2); // exactly the two that changed
  await expect(page.locator('#col-2 .swapfrom')).toHaveText('↔ from Day 3');
  await expect(page.locator('#col-3 .swapfrom')).toHaveText('↔ from Day 2');
  await expect(page.locator('#live-status')).toContainText('Day 2 swapped with Day 3');
  await expect(page.locator('.col.swapped')).toHaveCount(0, { timeout: 5000 }); // and then it is gone
});

test('on a phone the day it moved to is shown, with both day tabs outlined', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await page.locator('#daytab-2').click();
  await expect(page.locator('#swap-2-1')).toBeVisible(); // the arrows are not folded behind the ⋯ button
  await page.locator('#swap-2-1').click();
  await expect(page.locator('#daytab-3')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#daytab-2')).toHaveClass(/swapped/);
  await expect(page.locator('#daytab-3')).toHaveClass(/swapped/);
  await expect(page.locator('#col-3')).toBeInViewport();
  await expect(page.locator('.daytabs button.swapped')).toHaveCount(0, { timeout: 5000 });
});

test('with reduced motion the outline still shows and the pulse does not run', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await page.locator('#swap-2-1').click();
  const col = page.locator('#col-2');
  await expect(col).toHaveClass(/swapped/);
  expect(await col.evaluate(e => getComputedStyle(e).outlineStyle)).toBe('solid');
  expect(await col.evaluate(e => getComputedStyle(e).animationName)).toBe('none');
});
