import { test, expect } from './fixtures.js';

// Brief board-card-filters-weight: on a phone the joined week and day card holds, top to bottom, the filter row (Sort at the left, Injury prevention at the right), the week row, the day tabs and Body weight. From 700 px nothing of this applies.
const box = (page, sel) => page.locator(sel).first().boundingBox();

test('phone: the card holds the filter row, the week row, the day tabs and Body weight, in that order', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const card = page.locator('.wdc');
  await expect(card.locator('.wdc-head').getByRole('button', { name: /^Sort and filter/ })).toBeVisible();
  await expect(card.locator('.wdc-head .injsw')).toBeVisible();
  await expect(card.locator('.bwrow')).toHaveCount(1);
  await expect(page.locator('.bwrow')).toHaveCount(1);
  const [sort, inj, week, tabs, bw, c] = await Promise.all(['.wdc-sort', '.wdc-head .injsw', '.wdc-week', '.wdc-tabs', '.wdc .bwrow', '.wdc'].map(s => box(page, s)));
  expect(sort.x).toBeLessThan(inj.x);
  expect(Math.abs(sort.y - inj.y)).toBeLessThan(20);
  expect(inj.y + inj.height).toBeLessThanOrEqual(week.y + 1);
  expect(week.y + week.height).toBeLessThanOrEqual(tabs.y + 1);
  expect(tabs.y + tabs.height).toBeLessThanOrEqual(bw.y + 1);
  expect(bw.y + bw.height).toBeLessThanOrEqual(c.y + c.height + 1);
});

test('phone: the filter row scrolls away, the week row, day tabs and Body weight stay pinned', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, 700));
  await expect(page.locator('.wdc-tabs')).toBeInViewport();
  await expect(page.locator('.wdc-week')).toBeInViewport();
  await expect(page.locator('.wdc .bwrow')).toBeInViewport();
  const head = await box(page, '.wdc-head');
  expect(head.y + head.height).toBeLessThanOrEqual(2); // scrolled up out of view (its bottom edge at the top)
});

test('phone: Body weight saved from the card shows in the card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.wdc .bwrow input').fill('180');
  await page.locator('.wdc .bwrow').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.wdc .bwrow b')).toHaveText('180 lb');
});

test('desktop: the filter row and Body weight stay in the week card, none in the phone card', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.locator('.wsec .filterbar')).toBeVisible();
  await expect(page.locator('.wsec .bwrow')).toHaveCount(1);
  await expect(page.locator('.wdc')).toHaveCount(0);
});
