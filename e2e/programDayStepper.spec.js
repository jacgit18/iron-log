import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// The Program editor's day control: on a phone a stepper (previous, a picker of the seven days, next); on a wide screen one row of day tabs with each day's exercise count
// (brief program-tab-desktop-layout).
const stepper = page => page.getByRole('group', { name: 'Day stepper' });
const pick = page => page.getByRole('combobox', { name: 'Day to edit' });
const heading = page => page.locator('#ed-title');

test.describe('on a phone, the stepper changes the day', () => {
  test.use({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });
  test('the stepper and the picker change the day; the ends are disabled', async ({ page }) => {
    await page.click('#tab-program');
    await expect(stepper(page).getByRole('button', { name: 'Previous day' })).toBeDisabled();
    await stepper(page).getByRole('button', { name: 'Next day' }).click();
    await expect(heading(page)).toContainText('Day 2');
    await pick(page).selectOption('7');
    await expect(heading(page)).toContainText('Day 7');
    await expect(stepper(page).getByRole('button', { name: 'Next day' })).toBeDisabled();
  });
});

test('on a wide screen the day tabs jump to a day, are centred, show the exercise count, and there is no stepper', async ({ page }) => {
  await page.click('#tab-program');
  const jump = page.getByRole('group', { name: 'Jump to day' });
  await jump.getByRole('button', { name: /^Day 5/ }).click();
  await expect(heading(page)).toContainText('Day 5');
  const b = jump.getByRole('button', { name: /^Day 5/ });
  await expect(b).toHaveAttribute('aria-pressed', 'true');
  await expect(b).toContainText(/\d+ exercises?|rest/);
  expect(await b.evaluate(el => getComputedStyle(el).textAlign)).toBe('center');
  await expect(stepper(page)).toHaveCount(0);
  await expect(pick(page)).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });
  test('only the stepper shows: one row, no sideways scroll, 44px targets, no accessibility violations', async ({ page }) => {
    await page.click('#tab-program');
    await expect(page.getByRole('group', { name: 'Jump to day' })).toBeHidden();
    for (const b of await stepper(page).getByRole('button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect((await pick(page).boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const { violations } = await new AxeBuilder({ page }).include('.edtop').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map(v => v.id)).toEqual([]);
  });
});

test('on a wide screen the day tabs are one row under the header card, starting at the page edge', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click('#tab-program');
  const tabs = await page.getByRole('group', { name: 'Jump to day' }).boundingBox();
  const head = await page.locator('.proghead').boundingBox();
  expect(tabs.y).toBeGreaterThanOrEqual(head.y + head.height);
  expect(Math.abs(tabs.x - head.x)).toBeLessThanOrEqual(2);
  const rows = await page.locator('.dtabs button').evaluateAll(bs => new Set(bs.map(b => Math.round(b.getBoundingClientRect().top))).size);
  expect(rows).toBe(1);
});

// The desktop day tabs never show a scrollbar: overflow-x:auto made the strip a vertical scroller too, and the tabs' -1px bottom margin over its border then overflowed it by 1px (b-program-days-scrollbar). A phone has no tab strip (stepper only).
for (const w of [1024, 1280, 1440, 1920]) {
  test(`at ${w}px the day tabs have no scrollbar and stay on one row`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.click('#tab-program');
    const m = await page.locator('.dtabs').evaluate(el => {
      const cs = getComputedStyle(el);
      return { ox: cs.overflowX, oy: cs.overflowY, bar: el.offsetWidth - el.clientWidth, rows: new Set([...el.children].map(b => Math.round(b.getBoundingClientRect().top))).size };
    });
    expect(['auto', 'scroll']).not.toContain(m.ox);
    expect(['auto', 'scroll']).not.toContain(m.oy);
    expect(m.bar).toBe(0);
    expect(m.rows).toBe(1);
  });
}

test('on a phone there is no day tab strip, only the stepper', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.click('#tab-program');
  await expect(page.locator('.dtabs')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Day stepper' })).toBeVisible();
});
