import { test, expect } from './fixtures.js';

// Experiments: an entry says which days of the viewed week it is already on, so Add twice is a choice and a card in another column is findable.
test('a workout experiment shows the days it was added to this week', async ({ page }) => {
  await page.goto('/');
  await page.click('#tab-program');
  const rows = page.locator('.edrow');
  await expect(rows.first()).toBeVisible();
  await rows.first().getByRole('button', { name: /to Experiments$/ }).click();
  await page.click('#tab-board');
  const card = page.locator('.explist .expcard');
  await expect(card.locator('.onday')).toHaveCount(0);
  await card.locator('select').selectOption('1');
  await card.getByRole('button', { name: /^Add .* to Day 1$/ }).click();
  await expect(card.locator('.onday')).toHaveText('On Day 1 this week');
  await card.locator('select').selectOption('2');
  await card.getByRole('button', { name: /^Add .* to Day 2$/ }).click();
  await expect(card.locator('.onday')).toHaveText('On Day 1, Day 2 this week');
});

test('a stretch experiment shows the days it was added to this week', async ({ page }) => {
  await page.goto('/');
  await page.click('#board-stretches');
  await page.click('#sexp-add');
  await page.fill('#sexp-name', 'Frog Stretch');
  await page.keyboard.press('Enter');
  const card = page.locator('.explist .expcard');
  await expect(card.locator('.onday')).toHaveCount(0);
  await card.locator('select').selectOption('3');
  await card.getByRole('button', { name: /^Add Frog Stretch to/ }).click();
  await expect(card.locator('.onday')).toHaveText('On Wednesday this week');
});
