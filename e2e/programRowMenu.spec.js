import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Program rows keep Edit and a ⋯ menu; Move up and down, Move to day, Move to another program and Remove live in the menu sheet.
const rows = page => page.locator('.edpanel:not(.lib) .edrow');
const names = page => rows(page).locator('.edmain b').allTextContents();
const more = row => row.getByRole('button', { name: /^More actions for / });
const sheet = page => page.getByRole('dialog');

for (const [label, width] of [['phone', 375], ['desktop', 1440]]) {
  test(`${label}: a row shows only Edit and ⋯ beside its handle, and nothing wraps`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.click('#tab-program');
    await expect(rows(page).first()).toBeVisible();
    for (const row of await rows(page).all()) {
      await expect(row.getByRole('button')).toHaveCount(2);
      const btns = await row.getByRole('button').all();
      const [a, b] = await Promise.all(btns.map(x => x.boundingBox()));
      expect(Math.abs(a.y - b.y)).toBeLessThan(2); // on one line
      expect(a.height).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('the menu moves a card up and down, disables the ends, and closes with focus back on ⋯', async ({ page }) => {
  await page.click('#tab-program');
  await expect(rows(page).first()).toBeVisible();
  const before = await names(page);
  await more(rows(page).first()).click();
  await expect(sheet(page).getByRole('button', { name: 'Move up' })).toHaveAttribute('aria-disabled', 'true');
  await sheet(page).getByRole('button', { name: 'Move down' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect.poll(() => names(page)).toEqual([before[1], before[0], ...before.slice(2)]);
  await more(rows(page).last()).click();
  await expect(sheet(page).getByRole('button', { name: 'Move down' })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await expect(more(rows(page).last())).toBeFocused();
});

test('the menu has no accessibility violations and offers every action', async ({ page }) => {
  await page.click('#tab-program');
  await more(rows(page).first()).click();
  for (const n of ['Move up', 'Move down', 'Move to another program…', 'Close']) await expect(sheet(page).getByRole('button', { name: n })).toBeVisible();
  await expect(sheet(page).getByRole('group', { name: 'Move to day' }).getByRole('button')).toHaveCount(7);
  await expect(sheet(page).getByRole('button', { name: /^Remove / })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).include('[role=dialog]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => v.id)).toEqual([]);
});
