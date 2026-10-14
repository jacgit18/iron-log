import { test, expect } from './fixtures.js';

// Supplements and Water on a phone share Groceries' flat pattern (Supplements.css): a supplement row is one 44px tap target with the
// tick beside its name, and nothing scrolls the page sideways at the narrowest width.
const open = async page => { await page.setViewportSize({ width: 320, height: 700 }); await page.click('#tab-daily'); await page.click('#daily-supplements'); };
const addOne = async (page, n, dose) => {
  await page.click('#sched-edit');
  await page.fill('#suppname-morning', n); await page.fill('#suppdose-morning', dose);
  await page.click('#suppadd-morning');
  await expect(page.locator('.srow', { hasText: n })).toHaveCount(1); // really added, so the checks below are not vacuous
  await page.click('#sched-edit');
};

test('a supplement row ticks from its whole label, with the tick beside the name', async ({ page }) => {
  await open(page);
  await addOne(page, 'Creatine', '5 g');
  const label = page.locator('.stick').first();
  const tick = label.locator('.chk'); const name = label.locator('.rmname');
  const [t, n, l] = await Promise.all([tick.boundingBox(), name.boundingBox(), label.boundingBox()]);
  expect(Math.abs((t.y + t.height / 2) - (n.y + n.height / 2)), 'tick and name on one line').toBeLessThan(l.height / 2);
  expect(l.height).toBeGreaterThanOrEqual(44);
  await name.click(); // the name, not the box, is what a thumb hits
  await expect(tick).toBeChecked();
  await expect(page.locator('.srow').first()).toHaveClass(/taken/);
});

test('Supplements and Water keep every control at least 44px and never scroll sideways', async ({ page }) => {
  await open(page);
  await addOne(page, 'Fish oil', '2 caps');
  const small = await page.evaluate(() => [...document.querySelectorAll('.suppanel .btn, .suppanel .chip, .stick')]
    .filter(e => { const b = e.getBoundingClientRect(); return b.width && b.height < 43.5; }).map(e => e.className + ' ' + e.textContent.trim().slice(0, 20)));
  expect(small).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
