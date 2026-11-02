import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

test('desktop: each day column shows done/total exercises at the right of its first section label, and the week progress row is gone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.weekbar .progress')).toHaveCount(0);
  const label = page.locator('#col-1 .sect.withcount').first();
  await expect(label).toContainText('0/12 exercises');
  const l = await label.boundingBox(); const c = await label.locator('span').boundingBox();
  expect(c.x + c.width).toBeGreaterThan(l.x + l.width - 12); // at the right end of the label row
  await page.locator('#col-1 .card .chk').first().check();
  await expect(page.locator('#col-1 .sect.withcount').first()).not.toContainText('0/12'); // ticking moves the done number; the total stays 12
  await expect(page.locator('#col-1 .sect.withcount').first()).toContainText('/12 exercises');
});

test('desktop: every day with cards has one count, a rest day none', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.col .sect.withcount')).toHaveCount(await page.locator('.col:has(.card)').count());
  await page.check('#rest-2');
  await expect(page.locator('#col-2 .sect.withcount')).toHaveCount(0);
});

test('phone: no count is added to the day columns, and the day tab still shows it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('.sect.withcount')).toHaveCount(0);
  await expect(page.locator('#daytab-1')).toContainText('0/12');
  await expect(page.locator('.weekbar .progress')).toHaveCount(0);
});

test('Program tab: the Day stepper shows the day’s exercise count, the Day buttons keep a 44px target and stay named Day N', async ({ page }) => {
  await page.click('#tab-program');
  const pick = page.getByRole('combobox', { name: 'Day to edit' });
  await expect(pick.locator('option:checked')).toHaveText('Day 1 of 7 · 12 exercises');
  await expect(pick.locator('option').nth(6)).toHaveText('Day 7 of 7 · 0 exercises');
  const days = page.getByRole('group', { name: 'Jump to day' });
  await expect(days.getByRole('button', { name: 'Day 7', exact: true })).not.toContainText('0');
  for (const b of await page.locator('.edtop').first().getByRole('button').all()) if (await b.isVisible()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  const { violations } = await new AxeBuilder({ page }).include('.edtop').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => v.id)).toEqual([]);
});

test('Program tab: moving a card to another day updates both counts', async ({ page }) => {
  await page.click('#tab-program');
  const pick = page.getByRole('combobox', { name: 'Day to edit' });
  await page.locator('.edpanel:not(.lib) .edrow').first().getByRole('button', { name: /^More actions for / }).click();
  await page.getByRole('dialog').getByRole('group', { name: 'Move to day' }).getByRole('button', { name: 'Day 7', exact: true }).click();
  await expect(pick.locator('option').nth(0)).toHaveText('Day 1 of 7 · 11 exercises');
  await expect(pick.locator('option').nth(6)).toHaveText('Day 7 of 7 · 1 exercise');
});
