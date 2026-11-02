import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// The Exercise and Stretch libraries: a search box, filter chips, collapsible stretch groups and an Edit order mode.
const openLib = async (page, name) => { await page.click('#tab-program'); await page.getByRole('button', { name, exact: true }).click(); };
const lib = page => page.locator('.exlib');

test.use({ viewport: { width: 375, height: 800 } });

test('Exercise library: the search box and chips fit two lines, a chip filters and shows ×, Clear resets', async ({ page }) => {
  await openLib(page, 'Exercise library');
  const bar = lib(page).locator('.libbar');
  await expect(bar.getByRole('searchbox')).toBeVisible();
  expect((await bar.boundingBox()).height).toBeLessThan(220); // search, one line of chips and the count
  const status = bar.getByRole('status');
  const total = Number((await status.textContent()).match(/^(\d+) exercises$/)[1]);
  await bar.getByRole('combobox', { name: 'Equipment' }).selectOption('barbell');
  await expect(bar.locator('.libchip.on')).toHaveCount(1);
  await expect(status).toHaveText(new RegExp(`^\\d+ of ${total} exercises$`));
  await bar.getByRole('button', { name: 'Clear Equipment filter' }).click();
  await expect(bar.locator('.libchip.on')).toHaveCount(0);
  await expect(status).toHaveText(`${total} exercises`);
  await bar.getByRole('searchbox').fill('zzzz-no-match');
  await expect(status).toHaveText(`0 of ${total} exercises`);
  await bar.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(status).toHaveText(`${total} exercises`);
});

test('Stretch library: Every day starts open, the others closed with counts, and a search opens what matches', async ({ page }) => {
  await openLib(page, 'Stretch library');
  const heads = lib(page).locator('.libgroup');
  await expect(heads.first()).toHaveAttribute('aria-expanded', 'true');
  await expect(heads.first()).toContainText('Every day · ');
  const n = await heads.count();
  expect(n).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < n; i++) await expect(heads.nth(i)).toHaveAttribute('aria-expanded', 'false');
  await heads.nth(1).click();
  await expect(heads.nth(1)).toHaveAttribute('aria-expanded', 'true');
  await heads.nth(1).click();
  await expect(heads.nth(1)).toHaveAttribute('aria-expanded', 'false');
  await lib(page).getByRole('searchbox').fill('a'); // matches in several groups
  await expect(lib(page).locator('button.libgroup')).toHaveCount(0); // while searching the headers are plain text: every group with a match is open and cannot be folded
  expect(await lib(page).locator('div.libgroup').count()).toBeGreaterThanOrEqual(2);
  await expect(lib(page).locator('.exrow').first()).toBeVisible();
});

test('Stretch library: arrows show only in Edit order, which is not offered while searching', async ({ page }) => {
  await openLib(page, 'Stretch library');
  const arrows = lib(page).getByRole('button', { name: /^Move .* (up|down)$/ });
  await expect(arrows).toHaveCount(0);
  await lib(page).getByRole('button', { name: 'Edit order' }).click();
  expect(await arrows.count()).toBeGreaterThan(0);
  await lib(page).getByRole('button', { name: 'Done' }).click();
  await expect(arrows).toHaveCount(0);
  await lib(page).getByRole('searchbox').fill('a');
  await expect(lib(page).getByRole('button', { name: 'Edit order' })).toHaveCount(0);
});

for (const name of ['Exercise library', 'Stretch library']) {
  test(`${name}: 44px targets, no sideways scroll, no accessibility violations`, async ({ page }) => {
    await openLib(page, name);
    for (const b of await lib(page).locator('.libbar, .libgroup').getByRole('button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
    for (const b of await lib(page).locator('.libchip select').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const { violations } = await new AxeBuilder({ page }).include('.exlib').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map(v => v.id)).toEqual([]);
  });
}
