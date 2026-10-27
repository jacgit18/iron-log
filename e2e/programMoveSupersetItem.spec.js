import { test, expect } from './fixtures.js';

// One exercise of a superset can go to another day on its own; it lands as a card of its own and the other exercise stays. Either/or and plain cards move whole.
const open = async (page, n) => { await page.click('#tab-program'); await page.getByRole('group', { name: 'Day to edit' }).getByRole('button', { name: `Day ${n}`, exact: true }).click(); };
const names = page => page.locator('.edpanel:not(.lib) .edrow .edmain b').allTextContents();
const supersetRow = page => page.locator('.edpanel:not(.lib) .edrow').filter({ hasText: 'Superset' }).first();

test('a superset exercise moves to another day on its own, and Undo puts the superset back', async ({ page }) => {
  await open(page, 1);
  const row = supersetRow(page);
  const [first, second] = (await row.locator('.edmain b').textContent()).split(' → ');
  await row.getByRole('group', { name: /^Move one exercise of/ }).getByRole('combobox', { name: `Move ${first} to another day` }).selectOption('3');
  const note = page.getByRole('status').filter({ hasText: 'Moved' });
  await expect(note).toContainText(`Moved ${first} to`);
  const after = await names(page);
  expect(after).not.toContain(`${first} → ${second}`);
  expect(after).toContain(second);
  expect(after).not.toContain(first);
  await note.getByRole('button', { name: 'Go to Day 3' }).click();
  expect(await names(page)).toContain(first);
});

test('Undo right after the move restores the day exactly', async ({ page }) => {
  await open(page, 1);
  const before = await names(page);
  const row = supersetRow(page);
  const first = (await row.locator('.edmain b').textContent()).split(' → ')[0];
  await row.getByRole('combobox', { name: `Move ${first} to another day` }).selectOption('5');
  await page.getByRole('status').filter({ hasText: 'Moved' }).getByRole('button', { name: 'Undo' }).click();
  expect(await names(page)).toEqual(before);
});

test('plain cards have no per-exercise move', async ({ page }) => {
  await open(page, 1);
  const plain = page.locator('.edpanel:not(.lib) .edrow').filter({ hasNotText: /Superset|Either/ }).first();
  await expect(plain.getByRole('group', { name: /^Move one exercise/ })).toHaveCount(0);
});
