import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// The Program editor's day control: a stepper (previous, a picker of the seven days, next) everywhere, plus Day buttons to jump on a wide screen only.
const stepper = page => page.getByRole('group', { name: 'Day stepper' });
const pick = page => page.getByRole('combobox', { name: 'Day to edit' });
const heading = page => page.locator('#ed-title');

test('the stepper and the picker change the day; the ends are disabled', async ({ page }) => {
  await page.click('#tab-program');
  await expect(stepper(page).getByRole('button', { name: 'Previous day' })).toBeDisabled();
  await stepper(page).getByRole('button', { name: 'Next day' }).click();
  await expect(heading(page)).toContainText('Day 2');
  await pick(page).selectOption('7');
  await expect(heading(page)).toContainText('Day 7');
  await expect(stepper(page).getByRole('button', { name: 'Next day' })).toBeDisabled();
});

test('on a wide screen the Day buttons jump to a day, are centred, and show no count', async ({ page }) => {
  await page.click('#tab-program');
  const jump = page.getByRole('group', { name: 'Jump to day' });
  await jump.getByRole('button', { name: 'Day 5', exact: true }).click();
  await expect(heading(page)).toContainText('Day 5');
  await expect(pick(page)).toHaveValue('5');
  const b = jump.getByRole('button', { name: 'Day 5', exact: true });
  await expect(b).toHaveText('Day 5');
  expect(await b.evaluate(el => getComputedStyle(el).textAlign)).toBe('center');
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

test('on a wide screen the Day buttons sit under the stepper, not beside it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click('#tab-program');
  const s = await stepper(page).boundingBox();
  const d = await page.getByRole('group', { name: 'Jump to day' }).boundingBox();
  expect(d.y).toBeGreaterThanOrEqual(s.y + s.height); // below it, even when the row has room for both
  expect(d.x).toBeLessThanOrEqual(s.x + 2); // starting at the same left edge
});
