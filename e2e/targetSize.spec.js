import { test, expect } from './fixtures.js';

// Every pointer target is at least 44x44 CSS px on a phone. axe does not check this (see ux/DESIGN-SYSTEM.md), so it is checked here by size.
const TABS = ['Board', 'Daily', 'Progress', 'Program', 'Settings'];
const SELECTOR = 'button, select, textarea, input:not([type=hidden]), [role=tab], [role=switch], a[href]';

async function small(page) {
  return page.evaluate((sel) => {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Inline links inside a sentence are exempt (WCAG 2.5.8); so is a checkbox, radio or hidden input that a 44px label covers.
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue;
      if ((s.opacity === '0' || el.type === 'checkbox' || el.type === 'radio') && el.closest('label')) {
        const lr = el.closest('label').getBoundingClientRect();
        if (lr.width >= 43.5 && lr.height >= 43.5) continue;
      }
      if (r.width < 43.5 || r.height < 43.5) {
        out.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  }, SELECTOR);
}

test('phone 390x844: every button, field and tab is at least 44x44 on each tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const t of TABS) {
    await page.getByRole('tab', { name: t, exact: true }).click();
    expect(await small(page), `${t} has targets under 44px`).toEqual([]);
  }
});

// The test above only sees each tab's first view; these are the other views a tab opens (Groceries and Medical are admin-only, Stretches is its own area).
for (const [name, clicks] of [
  ['Progress > Muscles', [['tab', 'Progress'], ['button', 'Muscles']]],
  ['Daily > Nutrition', [['tab', 'Daily'], ['button', 'Nutrition']]],
  ['Program > Exercise library', [['tab', 'Program'], ['button', 'Exercise library']]],
  ['Program > Stretch library', [['tab', 'Program'], ['button', 'Stretch library']]],
]) {
  test(`phone 390x844: ${name} has no target under 44px`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [role, label] of clicks) await page.getByRole(role, { name: label, exact: true }).click();
    expect(await small(page), `${name} has targets under 44px`).toEqual([]);
  });
}

test('phone 390x844: the Log sheet has no target under 44px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^Log /i }).first().click();
  await expect(page.locator('.sheet')).toBeVisible();
  expect(await small(page)).toEqual([]);
});
