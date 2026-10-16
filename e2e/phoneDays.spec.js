import { test, expect } from './fixtures.js';

// On a phone the Board draws the cards of the day on screen only; the other six day sections keep their heading (the day tabs point at
// them) and fill in when their day is picked. A wide screen draws every day.
test('on a phone only the day on screen has cards, and a day fills in when its tab is picked', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  const shown = page.locator('.col.sel');
  await expect(shown.locator('article.card').first()).toBeVisible();
  const others = page.locator('.col:not(.sel)');
  expect(await others.count()).toBeGreaterThan(0);
  await expect(page.locator('.col:not(.sel) article.card')).toHaveCount(0); // nothing is drawn for a day that is not on screen
  await expect(page.locator('.col:not(.sel) h3').first()).toBeAttached(); // but each keeps its heading, which its day tab points at
  for (const t of await page.locator('.daytabs button').all()) await expect(page.locator(`#${await t.getAttribute('aria-controls')}`)).toHaveCount(1);
  const pickedId = await page.locator('.col:not(.sel):not(.rest)').first().getAttribute('id'); // e.g. col-3
  const n = pickedId.replace('col-', '');
  await page.locator(`#daytab-${n}`).click();
  await expect(page.locator(`#${pickedId}`)).toHaveClass(/sel/);
  await expect(page.locator(`#${pickedId} article.card`).first()).toBeVisible();
  await expect(page.locator('.col:not(.sel) article.card')).toHaveCount(0); // and the one it replaced is emptied again
});

test('swiping to the next day fills it in', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  const first = await page.locator('.col.sel').getAttribute('id');
  const next = `col-${Number(first.replace('col-', '')) + 1}`;
  await expect(page.locator(`#${next} article.card`)).toHaveCount(0);
  await page.locator('#board-workout').scrollIntoViewIfNeeded();
  const box = await page.locator('.boardroot').boundingBox();
  await page.touchscreen.tap(box.x + 10, box.y + 10).catch(() => {}); // a phone context is not required for the touch events below
  await page.evaluate(() => {
    const el = document.querySelector('.boardroot');
    const t = (type, x) => el.dispatchEvent(new TouchEvent(type, { bubbles: true, changedTouches: [new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 })], touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 })] }));
    t('touchstart', 300); t('touchend', 150);
  });
  await expect(page.locator(`#${next}`)).toHaveClass(/sel/);
  await expect(page.locator(`#${next} article.card`).first()).toBeVisible();
});

test('on a wide screen every day has its cards', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  expect(await page.locator('.col article.card').count()).toBeGreaterThan(40); // all the days, not the one on screen
  expect(await page.locator('.col:not(.sel) article.card').count()).toBeGreaterThan(20);
});
