import { test, expect } from './fixtures.js';

// On a phone a day's Rest day box folds behind a ⋯ button (the swap arrows stay shown); on a wide screen it is always shown.
const phone = async page => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.locator('.col.sel article.card').first()).toBeVisible();
};

test('on a phone the Rest day box opens from ⋯ on the day header, and the swap arrows are always shown', async ({ page }) => {
  await phone(page);
  const col = page.locator('.col.sel');
  const more = col.getByRole('button', { name: /^More for Day \d/ });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(col.locator('.restchk')).toBeHidden();
  await expect(col.locator('.swapbtn').first()).toBeVisible();
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(col.locator('.restchk')).toBeVisible();
  await expect(col.locator('.swapbtn').first()).toBeVisible();
  await more.click();
  await expect(col.locator('.restchk')).toBeHidden();
});

test('on a phone a rest day keeps its Rest day box shown, with no ⋯', async ({ page }) => {
  await phone(page);
  const col = page.locator('.col.sel');
  await col.getByRole('button', { name: /^More for Day \d/ }).click();
  await col.locator('.restchk input').check();
  await page.locator('#daytab-1').click(); // the board moves to the first training day; go back to the rest day
  const rest = page.locator('.col.sel.rest');
  await expect(rest.locator('.restchk')).toBeVisible();
  await expect(rest.getByRole('button', { name: /^More for Day/ })).toHaveCount(0);
});

test('on a wide screen the Rest day box and swap arrows are always shown and there is no ⋯', async ({ page }) => {
  const col = page.locator('#col-1');
  await expect(col.locator('.restchk')).toBeVisible();
  await expect(col.getByRole('button', { name: /^More for Day/ })).toBeHidden();
});
