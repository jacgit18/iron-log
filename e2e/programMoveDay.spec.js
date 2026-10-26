import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const day = n => ({ name: `Day ${n}`, exact: true });
const open = async (page, n) => { await page.click('#tab-program'); await page.getByRole('group', { name: 'Day to edit' }).getByRole('button', day(n)).click(); };
const names = page => page.locator('.edpanel:not(.lib) .edrow .edmain b').allTextContents();
const firstRow = page => page.locator('.edpanel:not(.lib) .edrow').first();

test('moving a card to Day 3 takes it off Day 1, with Undo and Go to Day 3', async ({ page }) => {
  await open(page, 1);
  const before = await names(page); const first = before[0];
  const select = firstRow(page).getByRole('combobox', { name: /^Move to day/ });
  await expect(select).toHaveValue('1');
  await select.selectOption('3');
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
  await firstRow(page).getByRole('combobox', { name: /^Move to day/ }).selectOption('5');
  await page.getByRole('status').filter({ hasText: 'Moved' }).getByRole('button', { name: 'Undo' }).click();
  expect(await names(page)).toEqual(before);
});

test('the select is a 44px target with no accessibility violations', async ({ page }) => {
  await open(page, 1);
  const box = await firstRow(page).getByRole('combobox', { name: /^Move to day/ }).boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  const { violations } = await new AxeBuilder({ page }).include('.edpanel').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => v.id)).toEqual([]);
});

test('Go to Day 3 puts focus on the moved card’s select', async ({ page }) => {
  await open(page, 1);
  const id = await firstRow(page).getByRole('combobox', { name: /^Move to day/ }).getAttribute('id');
  await firstRow(page).getByRole('combobox', { name: /^Move to day/ }).selectOption('3');
  await page.getByRole('button', { name: 'Go to Day 3' }).click();
  await expect(page.locator(`#${id}`)).toBeFocused();
});

test('a superset moves as one card', async ({ page }) => {
  await open(page, 1);
  const row = page.locator('.edpanel:not(.lib) .edrow').filter({ hasText: 'Superset' }).first();
  const name = await row.locator('.edmain b').textContent();
  await row.getByRole('combobox', { name: /^Move to day/ }).selectOption('2');
  expect(await names(page)).not.toContain(name);
  await page.getByRole('button', { name: 'Go to Day 2' }).click();
  expect((await names(page)).filter(n => n === name)).toHaveLength(1);
});

test('arrow keys browse the days; the card moves only on Enter', async ({ page }) => {
  await open(page, 1);
  const before = await names(page);
  const select = firstRow(page).getByRole('combobox', { name: /^Move to day/ });
  await select.focus();
  await page.keyboard.press('ArrowDown');
  expect(await names(page)).toEqual(before);
  await page.keyboard.press('Enter');
  expect(await names(page)).toEqual(before.slice(1));
});
