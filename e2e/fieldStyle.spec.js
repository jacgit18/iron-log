import { test, expect } from './fixtures.js';

// A text field, number field or select that no style rule reaches falls back to the browser's own look (square corners, a 2px grey border, 2px padding).
// Field styling is opt-in by wrapper (ux/DESIGN-SYSTEM.md "Fields"), so this walks the tabs that have fields and fails on one that looks unstyled.
// The Board and Stretches are not walked on purpose: they are hands off in design work (CLAUDE.md), and their fields are their own.
const SELECTOR = 'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]):not([type=range]), select, textarea';

async function unstyled(page) {
  return page.evaluate(sel => [...document.querySelectorAll(sel)].flatMap(el => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    if (!r.width || !r.height || s.visibility === 'hidden') return [];
    const bad = [];
    if (parseFloat(s.borderTopLeftRadius) < 4) bad.push(`radius ${s.borderTopLeftRadius}`);
    if (parseFloat(s.paddingLeft) < 4) bad.push(`padding ${s.paddingLeft}`);
    return bad.length ? [`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.id || el.placeholder || '').slice(0, 30)}": ${bad.join(', ')}`] : [];
  }), SELECTOR);
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
  expect(await unstyled(page)).toEqual([]);
});

for (const [name, clicks] of [
  ['Daily > Nutrition', ['#tab-daily', '#daily-supplements']],
  ['Progress', ['#tab-progress']],
  ['Program', ['#tab-program']],
  ['Settings', ['#tab-settings']],
]) {
  test(`${name}: every text field, number field and select is styled`, async ({ page }) => {
    for (const c of clicks) await page.click(c);
    expect(await unstyled(page)).toEqual([]);
  });
}
