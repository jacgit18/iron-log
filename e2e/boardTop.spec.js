import { test, expect } from './fixtures.js';

// On a phone the sort and equipment fields fold behind one button, so the day tabs and the first card are not
// pushed off the first screen. On a wide screen they are always there.
const phone = async page => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.locator('.col.sel article.card').first()).toBeVisible();
};

test('on a phone the sort and equipment fields fold behind Sort & filter', async ({ page }) => {
  await phone(page);
  const toggle = page.getByRole('button', { name: /Sort & filter/ });
  const sort = page.getByLabel('Sort by muscle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(sort).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(sort).toBeVisible();
  await expect(page.getByLabel('Equipment')).toBeVisible();
});

test('a filter in use shows on the folded button, and Clear still works', async ({ page }) => {
  await phone(page);
  const toggle = page.getByRole('button', { name: /Sort & filter/ });
  await toggle.click();
  await page.getByLabel('Sort by muscle').selectOption({ index: 1 });
  await expect(toggle).toHaveText(/1 on/);
  await toggle.click();
  await expect(page.getByLabel('Sort by muscle')).toBeHidden();
  await expect(toggle).toHaveText(/1 on/);
  await toggle.click();
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(toggle).not.toHaveText(/on/);
});

test('the day tabs are on the first phone screen', async ({ page }) => {
  await phone(page);
  const box = await page.locator('.daytabs').boundingBox();
  expect(box.y + box.height).toBeLessThan(812);
});

test('on a wide screen the fields are always shown and there is no toggle', async ({ page }) => {
  await expect(page.getByLabel('Sort by muscle')).toBeVisible();
  await expect(page.getByRole('button', { name: /Sort & filter/ })).toBeHidden();
});
