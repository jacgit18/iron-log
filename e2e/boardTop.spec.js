import { test, expect } from './fixtures.js';

// On a phone the sort and equipment pickers live in a sheet behind a filter icon, so the day tabs and the first card are not
// pushed off the first screen and never move. On a wide screen the fields are always there.
const phone = async page => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.locator('.col.sel article.card').first()).toBeVisible();
};

test('on a phone the pickers are in a sheet behind the filter icon, and the day tabs do not move', async ({ page }) => {
  await phone(page);
  const icon = page.getByRole('button', { name: /^Sort and filter/ });
  await expect(page.getByLabel('Sort by muscle')).toHaveCount(0);
  const before = await page.locator('.wdc-tabs').boundingBox();
  await icon.click();
  const dialog = page.getByRole('dialog', { name: 'Sort & filter' });
  await expect(dialog.getByLabel('Sort by muscle')).toBeVisible();
  await expect(dialog.getByLabel('Equipment')).toBeVisible();
  await dialog.getByRole('button', { name: 'Show cards' }).click();
  await expect(dialog).toBeHidden();
  expect((await page.locator('.wdc-tabs').boundingBox()).y).toBe(before.y);
});

test('a filter in use shows a count and a summary line, and Clear still works', async ({ page }) => {
  await phone(page);
  const icon = page.getByRole('button', { name: /^Sort and filter/ });
  await expect(page.locator('.filtersummary')).toHaveCount(0);
  await icon.click();
  await page.getByLabel('Sort by muscle').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Show cards' }).click();
  await expect(icon).toHaveAccessibleName(/1 on/);
  await expect(page.locator('.filtersummary')).toContainText(/first/);
  await page.locator('.filtersummary').getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('.filtersummary')).toHaveCount(0);
  await expect(icon).not.toHaveAccessibleName(/on/);
});

test('the day tabs are on the first phone screen', async ({ page }) => {
  await phone(page);
  const box = await page.locator('.wdc-tabs').boundingBox();
  expect(box.y + box.height).toBeLessThan(812);
});

test('on a wide screen the fields are always shown and there is no filter icon', async ({ page }) => {
  await expect(page.getByLabel('Sort by muscle')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Sort and filter/ })).toHaveCount(0);
});
