import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const day = n => ({ name: `Day ${n}`, exact: true });
const open = async (page, n) => { await page.click('#tab-program'); await page.getByRole('group', { name: 'Jump to day' }).getByRole('button', day(n)).click(); };
const names = page => page.locator('.edpanel:not(.lib) .edrow .edmain b').allTextContents();
const firstRow = page => page.locator('.edpanel:not(.lib) .edrow').first();
const more = row => row.getByRole('button', { name: /^More actions for / });
const sheet = page => page.getByRole('dialog');
// Opens a row's ⋯ menu and moves the card to day `n` with the Move to day chips.
const moveTo = async (page, row, n) => { await more(row).click(); await sheet(page).getByRole('group', { name: 'Move to day' }).getByRole('button', day(n)).click(); };

test('moving a card to Day 3 takes it off Day 1, with Undo and Go to Day 3', async ({ page }) => {
  await open(page, 1);
  const before = await names(page); const first = before[0];
  await more(firstRow(page)).click();
  await expect(sheet(page).getByRole('group', { name: 'Move to day' }).getByRole('button', day(1))).toHaveAttribute('aria-pressed', 'true');
  await sheet(page).getByRole('group', { name: 'Move to day' }).getByRole('button', day(3)).click();
  await expect(sheet(page)).toHaveCount(0);
  const note = page.getByRole('status').filter({ hasText: 'Moved' });
  await expect(note).toContainText('to Day 3');
  await expect(note.getByRole('button', { name: 'Undo' })).toBeFocused();
  expect(await names(page)).toEqual(before.slice(1));
  await note.getByRole('button', { name: 'Go to Day 3' }).click();
  expect(await names(page)).toContain(first);
  await expect(page.getByRole('status').filter({ hasText: 'Moved' })).toHaveCount(0);
});

test('Undo puts the card back where it was', async ({ page }) => {
  await open(page, 1);
  const before = await names(page);
  await moveTo(page, firstRow(page), 5);
  await page.getByRole('status').filter({ hasText: 'Moved' }).getByRole('button', { name: 'Undo' }).click();
  expect(await names(page)).toEqual(before);
});

test('the menu chips are 44px targets with no accessibility violations', async ({ page }) => {
  await open(page, 1);
  await more(firstRow(page)).click();
  await expect(sheet(page)).toBeVisible(); // the sheet is a lazy chunk: wait for it before reading its buttons or running axe
  for (const b of await sheet(page).getByRole('button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  const { violations } = await new AxeBuilder({ page }).include('[role=dialog]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => v.id)).toEqual([]);
});

test('Go to Day 3 puts focus on the moved card’s ⋯ button', async ({ page }) => {
  await open(page, 1);
  const id = await more(firstRow(page)).getAttribute('id');
  await moveTo(page, firstRow(page), 3);
  await page.getByRole('button', { name: 'Go to Day 3' }).click();
  await expect(page.locator(`#${id}`)).toBeFocused();
});

test('a superset moves as one card', async ({ page }) => {
  await open(page, 1);
  const row = page.locator('.edpanel:not(.lib) .edrow').filter({ hasText: 'Superset' }).first();
  const name = await row.locator('.edmain b').textContent();
  await moveTo(page, row, 2);
  expect(await names(page)).not.toContain(name);
  await page.getByRole('button', { name: 'Go to Day 2' }).click();
  expect((await names(page)).filter(n => n === name)).toHaveLength(1);
});
