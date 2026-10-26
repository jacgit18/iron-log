import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const openDay = async (page, n) => { await page.click('#tab-program'); await page.getByRole('group', { name: 'Day to edit' }).getByRole('button', { name: `Day ${n}`, exact: true }).click(); };
const names = page => page.locator('.edpanel:not(.lib) .edrow .edmain b').allTextContents();
const firstRow = page => page.locator('.edpanel:not(.lib) .edrow').first();
const moveBtn = page => firstRow(page).getByRole('button', { name: /^Move .* to another program or day$/ });
const sheet = page => page.getByRole('dialog');

test('Move… opens a sheet that previews where the card lands, then moves it to Program B', async ({ page }) => {
  await openDay(page, 1);
  const before = await names(page);
  await moveBtn(page).click();
  await expect(sheet(page).getByRole('heading', { name: `Move ${before[0]}` })).toBeVisible();
  await expect(sheet(page).getByRole('status')).toContainText('Program A · Day 2'); // opens on this program and the next day
  await sheet(page).getByRole('button', { name: 'Program B', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Day 3', exact: true }).click();
  await expect(sheet(page).getByRole('status')).toContainText('Program B · Day 3');
  await expect(sheet(page).getByRole('status')).toContainText('ticks stay behind');
  await sheet(page).getByRole('button', { name: 'Move', exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);
  const note = page.getByRole('status').filter({ hasText: 'Moved' });
  await expect(note).toContainText('to Program B · Day 3');
  await expect(note.getByRole('button', { name: 'Undo' })).toBeFocused();
  expect(await names(page)).toEqual(before.slice(1));
  await note.getByRole('button', { name: 'Go to Program B · Day 3' }).click();
  await expect(page.getByRole('group', { name: 'Program to edit' }).getByRole('button', { name: 'Program B' })).toHaveAttribute('aria-pressed', 'true');
  expect(await names(page)).toContain(before[0]);
});

test('Undo puts the card back in Program A, and Program B loses it', async ({ page }) => {
  await openDay(page, 1);
  const before = await names(page);
  await moveBtn(page).click();
  await sheet(page).getByRole('button', { name: 'Program B', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Move', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Moved' }).getByRole('button', { name: 'Undo' }).click();
  expect(await names(page)).toEqual(before);
  await page.getByRole('group', { name: 'Program to edit' }).getByRole('button', { name: 'Program B' }).click();
  await page.getByRole('group', { name: 'Day to edit' }).getByRole('button', { name: 'Day 2', exact: true }).click();
  expect(await names(page)).not.toContain(before[0]);
});

test('Cancel and Escape change nothing and return focus to Move…', async ({ page }) => {
  await openDay(page, 1);
  const before = await names(page);
  await moveBtn(page).click();
  await sheet(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(moveBtn(page)).toBeFocused();
  await moveBtn(page).click();
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  expect(await names(page)).toEqual(before);
});

test('the sheet has 44px targets and no accessibility violations at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDay(page, 1);
  await moveBtn(page).click();
  for (const b of await sheet(page).getByRole('button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  const { violations } = await new AxeBuilder({ page }).include('[role=dialog]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
