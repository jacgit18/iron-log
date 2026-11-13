import { test, expect } from './fixtures.js';
import { openSupplementEditor } from './nutritionBoardHelpers.js';

// A text field, number field or select that no style rule reaches falls back to the browser's own look (square corners, a 2px grey border, 2px padding).
// Field styling is opt-in by wrapper (ux/DESIGN-SYSTEM.md "Fields"), so this walks the tabs that have fields and fails on one that looks unstyled.
// It checks the corner radius and the left padding. The border width is not checked: the Groceries add dock has a 2px edge on purpose.
// Each walk also has to find fields (a lazy tab that has not rendered, or a tab that loses its fields, would otherwise pass on an empty page).
// The Board and Stretches are not walked on purpose: they are hands off in design work (CLAUDE.md), and their fields are their own.
const SELECTOR = 'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]):not([type=range]), select, textarea';

async function unstyled(page, min) {
  await expect(page.locator(SELECTOR).locator('visible=true').first()).toBeVisible();
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
  await page.getByRole('button', { name: 'Expand Eggs' }).click(); // edit rows start closed; open one so its fields are checked
  await page.click('#groc-more');
  expect(await unstyled(page, 10)).toEqual([]); // the item's fields, the store form and the dock with its More row
});

for (const [name, clicks, min] of [
  // Daily > Nutrition has no field of its own on a phone any more (the day dropdown became the joined day tabs); its add sheet, drink sheet and editor are walked below
  ['Progress > Frequency goals', ['#tab-progress', 'button.hubtile:has-text("Frequency goals")'], 1],
  ['Program', ['#tab-program'], 2],
]) {
  test(`${name}: every text field, number field and select is styled`, async ({ page }) => {
    for (const c of clicks) await page.click(c);
    expect(await unstyled(page, min)).toEqual([]);
  });
}

test('Daily > Nutrition: the add sheet, the drink sheet and the supplement editor have styled fields', async ({ page }) => {
  await page.click('#tab-daily'); await page.click('#daily-supplements');
  await page.click('#nb-add');
  await page.getByRole('dialog').getByRole('button', { name: /^One-off food/ }).click();
  expect(await unstyled(page, 2)).toEqual([]); // food, calories
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await page.locator('.nb-col.today').getByRole('button', { name: /^\+ Drink/ }).click();
  expect(await unstyled(page, 2)).toEqual([]); // other amount, training minutes
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await openSupplementEditor(page);
  expect(await unstyled(page, 1)).toEqual([]); // the library's search (the per-time add forms are the add sheet now)
  await page.click('#suplib-add');
  expect(await unstyled(page, 2)).toEqual([]); // the add sheet: search and dose
});

// Settings keeps Training's fields on screens of their own (Program mode, Phases, 1-rep maxes), so the page and each screen are walked.
test('Settings: every text field, number field and select is styled, on each Training screen', async ({ page }) => {
  await page.click('#tab-settings');
  await page.click('#drill-phases'); // the page itself has no open fields now; they are on the screens
  expect(await unstyled(page, 10)).toEqual([]); // a % and a sets-by-reps box for each phase (Mobility has no %), and the rest time
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await page.click('#drill-mode');
  await page.locator('#mode-2').check();
  expect(await unstyled(page, 1)).toEqual([]); // Mode 2 shows its "Even months run" select
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await page.click('#drill-maxes');
  await page.locator('.sdrill[id^="max-"]').first().click(); // an exercise's screen has the "I tested this" field
  expect(await unstyled(page, 1)).toEqual([]);
});

// R6 (design-language slice 6): every field of the Recipes form looks the same as the app's `.field` fields (the Nutrition one-off food sheet is the reference).
// Compared on computed border, radius and background, in light and dark. One test, no reload: the styles are read for both schemes before leaving each screen.
const looks = async (page, locator) => {
  const out = {};
  for (const scheme of ['light', 'dark']) { await page.emulateMedia({ colorScheme: scheme }); out[scheme] = await locator.evaluateAll(els => els.map(el => { const s = getComputedStyle(el); return { border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`, radius: s.borderTopLeftRadius, background: s.backgroundColor }; })); }
  return out;
};
test('Recipes form fields (inputs, select, textarea) match the app\'s fields, light and dark', async ({ page }) => {
  await page.click('#tab-daily'); await page.click('#daily-supplements');
  await page.click('#nb-add');
  await page.getByRole('dialog').getByRole('button', { name: /^One-off food/ }).click();
  const ref = await looks(page, page.locator('.field input').locator('visible=true').first());
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await page.click('#daily-recipes');
  await page.locator('#recipes-new').click();
  await page.locator('#recipes-new-list').getByRole('button', { name: 'Recipe or meal' }).click();
  const fields = page.locator('form.rcf').locator(SELECTOR).locator('visible=true');
  expect(await fields.count()).toBeGreaterThan(3);
  const got = await looks(page, fields);
  for (const scheme of ['light', 'dark']) for (const l of got[scheme]) expect(l, scheme).toEqual(ref[scheme][0]);
});
