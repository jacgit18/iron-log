import { test, expect } from './fixtures.js';

// The two add buttons under each board day say what they do: one joins the program, one is for this week only.
test('a board day offers + Add to program and + This week only', async ({ page }) => {
  const col = page.locator('#col-1');
  await expect(col.getByRole('button', { name: /^Add to program, Day 1/ })).toHaveText('+ Add to program');
  await expect(col.getByRole('button', { name: /^This week only: add an exercise to Day 1/ })).toHaveText('+ This week only');
});

test('+ Add to program opens the program add sheet and + This week only the one-week sheet', async ({ page }) => {
  await page.click('#add-1');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('heading', { name: /^Add exercise|Day 1/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.click('#addweek-1');
  await expect(page.getByRole('heading', { name: 'Add to Day 1, this week' })).toBeVisible();
});
