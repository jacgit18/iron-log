import { test, expect } from './fixtures.js';
import { closeSupplementEditor, openSupplementEditor } from './nutritionBoardHelpers.js';

// Supplements and Water on a phone share Groceries' flat pattern (Supplements.css): a supplement tick on the Nutrition board is one 44px tap target with the
// tick beside its name, and nothing scrolls the page sideways at the narrowest width.
const open = async page => { await page.setViewportSize({ width: 320, height: 700 }); await page.click('#tab-daily'); await page.click('#daily-supplements'); };
const addOne = async (page, n, dose) => {
  await openSupplementEditor(page);
  await page.click('#suplib-add');
  await page.fill('#suppadd-q', n); await page.fill('#suppadd-dose', dose);
  await page.click('#suppadd-go');
  await expect(page.locator('.srow', { hasText: n })).toHaveCount(1); // really added, so the checks below are not vacuous
  await closeSupplementEditor(page);
};

test('a supplement row ticks from its whole label, with the tick beside the name', async ({ page }) => {
  await open(page);
  await addOne(page, 'Creatine', '5 g');
  const label = page.locator('.nb-tick').first();
  const tick = label.locator('.chk'); const name = label.locator('span').first();
  const [t, n, l] = await Promise.all([tick.boundingBox(), name.boundingBox(), label.boundingBox()]);
  expect(Math.abs((t.y + t.height / 2) - (n.y + n.height / 2)), 'tick and name on one line').toBeLessThan(l.height / 2);
  expect(l.height).toBeGreaterThanOrEqual(44);
  await name.click(); // the name, not the box, is what a thumb hits
  await expect(tick).toBeChecked();
  await expect(label).toHaveClass(/taken/);
});

test('Supplements and Water keep every control at least 44px and never scroll sideways', async ({ page }) => {
  await open(page);
  await addOne(page, 'Fish oil', '2 caps');
  const small = await page.evaluate(() => [...document.querySelectorAll('.nb .btn, .nb .chip, .nb-tick, .nb-drink, .nb-dayname')]
    .filter(e => { const b = e.getBoundingClientRect(); return b.width && b.height < 43.5; }).map(e => e.className + ' ' + e.textContent.trim().slice(0, 20)));
  expect(small).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

// Lighthouse "label-content-name-mismatch": a control's accessible name must contain the text it shows. The Last 7 days water bars this guarded are gone; the board's day names ("Thu 24 · today")
// and "+ Drink" buttons carry the same risk, so each is checked against its own text.
test('each day name and + Drink button on the board is named with the text it shows', async ({ page }) => {
  await page.goto('/?open=daily');
  await expect(page.locator('#nb-h')).toBeVisible();
  for (const sel of ['.nb-dayname', '.nb-drink']) {
    const btns = page.locator(`.nb-col ${sel}`);
    const n = await btns.count();
    expect(n).toBe(7); // the wide board shows seven days
    for (let i = 0; i < n; i++) {
      const b = btns.nth(i);
      const shown = ((await b.evaluate(e => e.textContent || '')).replace(/\s+/g, ' ').trim());
      const name = ((await b.getAttribute('aria-label')) || '').replace(/\s+/g, ' ');
      expect(name, `${sel} shows "${shown}"`).toContain(shown);
    }
  }
});
