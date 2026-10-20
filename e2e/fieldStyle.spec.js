import { test, expect } from './fixtures.js';

// A text field, number field or select that no style rule reaches falls back to the browser's own look (square corners, a 2px grey border, 2px padding).
// Field styling is opt-in by wrapper (ux/DESIGN-SYSTEM.md "Fields"), so this walks the tabs that have fields and fails on one that looks unstyled.
// It checks the corner radius and the left padding. The border width is not checked: the Groceries add dock has a 2px edge on purpose.
// Each walk also has to find fields (a lazy tab that has not rendered, or a tab that loses its fields, would otherwise pass on an empty page).
// The Board and Stretches are not walked on purpose: they are hands off in design work (CLAUDE.md), and their fields are their own.
const SELECTOR = 'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]):not([type=range]), select, textarea';

async function unstyled(page, min) {
  await expect(page.locator(SELECTOR).first()).toBeVisible();
  const { checked, bad } = await page.evaluate(sel => {
    const bad = []; let checked = 0;
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      if (!r.width || !r.height || s.visibility === 'hidden') continue;
      checked++;
      const why = [];
      if (parseFloat(s.borderTopLeftRadius) < 4) why.push(`radius ${s.borderTopLeftRadius}`);
      if (parseFloat(s.paddingLeft) < 4) why.push(`padding ${s.paddingLeft}`);
      if (why.length) bad.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.id || el.placeholder || '').slice(0, 30)}": ${why.join(', ')}`);
    }
    return { checked, bad };
  }, SELECTOR);
  expect(checked, 'fields checked').toBeGreaterThanOrEqual(min);
  return bad;
}

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

test('Groceries: the add dock, the store form and the list fields are styled', async ({ page }) => {
  await page.click('#tab-daily');
  await page.click('#daily-grocery');
  await page.click('#groc-edit');
  await page.getByLabel('New store').fill('Costco');
  await page.getByRole('button', { name: 'Add store' }).click();
  await page.fill('#groc-name', 'Eggs');
  await page.click('#groc-add');
  await page.click('#groc-more');
  expect(await unstyled(page, 10)).toEqual([]); // the item's fields, the store form and the dock with its More row
});

for (const [name, clicks, min] of [
  ['Daily > Nutrition', ['#tab-daily', '#daily-supplements'], 2],
  ['Progress', ['#tab-progress'], 1],
  ['Program', ['#tab-program'], 2],
  ['Settings', ['#tab-settings'], 20],
]) {
  test(`${name}: every text field, number field and select is styled`, async ({ page }) => {
    for (const c of clicks) await page.click(c);
    expect(await unstyled(page, min)).toEqual([]);
  });
}
