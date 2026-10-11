import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const dayNames = async (page, n) => { await page.getByRole('group', { name: 'Day to edit' }).getByRole('button', { name: `Day ${n}`, exact: true }).click(); return page.locator('.edpanel:not(.lib) .edrow .edmain b').allTextContents(); };
const openAdd = async page => { await page.click('#tab-program'); await page.getByRole('button', { name: '+ Add exercise', exact: true }).click(); };

test('editing an exercise keeps the single Day drop-down', async ({ page }) => {
  await page.click('#tab-program');
  await page.locator('.edpanel:not(.lib) .edrow').first().getByRole('button', { name: /^Edit / }).click();
  await expect(page.getByRole('dialog').getByRole('combobox', { name: /^Day/ })).toBeVisible();
  await expect(page.locator('#slot-day-1')).toHaveCount(0);
});

test('adding one exercise to Days 1, 3 and 5 in one save', async ({ page }) => {
  await openAdd(page);
  await expect(page.locator('#slot-day-1')).toBeChecked();
  await page.check('#slot-day-3'); await page.check('#slot-day-5');
  const { violations } = await new AxeBuilder({ page }).include('[role=dialog]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => v.id)).toEqual([]);
  await page.getByRole('dialog').getByRole('combobox', { name: /Exercise/ }).fill('Farmer Carry Test');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const n of [1, 3, 5]) expect((await dayNames(page, n)).filter(x => x === 'Farmer Carry Test')).toHaveLength(1);
  for (const n of [2, 4, 6, 7]) expect(await dayNames(page, n)).not.toContain('Farmer Carry Test');
});

test('unticking every day asks for one', async ({ page }) => {
  await openAdd(page);
  await page.uncheck('#slot-day-1');
  await page.getByRole('dialog').getByRole('combobox', { name: /Exercise/ }).fill('Farmer Carry Test');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toHaveText('Pick at least one day.');
});
