import { test, expect } from './fixtures.js';

// A card's Move to, Skip and Remove sit behind a ⋯ button in its top-right corner.
const first = page => page.locator('#col-1 article.card').first();

test('Move to and Skip are folded away until ⋯ is pressed, and Escape folds them again', async ({ page }) => {
  const card = first(page);
  const more = card.getByRole('button', { name: /^More actions:/ });
  await expect(card.getByRole('combobox', { name: /^Move to/ })).toHaveCount(0);
  await expect(card.getByRole('button', { name: /^Skip / })).toHaveCount(0);
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByRole('combobox', { name: /^Move to/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card.getByRole('combobox', { name: /^Move to/ })).toHaveCount(0);
  await expect(more).toBeFocused();
});

test('Skip marks the card, and Undo skip stays on the card without opening ⋯', async ({ page }) => {
  const card = first(page);
  const id = await card.getByRole('button', { name: /^More actions:/ }).getAttribute('id');
  const key = id.replace('more-', '');
  await card.getByRole('button', { name: /^More actions:/ }).click();
  await page.locator(`#skip-${key}`).click();
  const skipped = page.locator(`article.card:has(#more-${key})`);
  await expect(skipped.getByText('Skipped this week')).toBeVisible();
  await expect(skipped.getByRole('combobox', { name: /^Move to/ })).toHaveCount(0);
  await page.locator(`#skip-${key}`).click();
  await expect(skipped.getByText('Skipped this week')).toHaveCount(0);
});

test('Move to sends the card to another day', async ({ page }) => {
  const card = first(page);
  const key = (await card.getByRole('button', { name: /^More actions:/ }).getAttribute('id')).replace('more-', '');
  await card.getByRole('button', { name: /^More actions:/ }).click();
  await page.locator(`#mv-${key}`).selectOption({ label: 'Day 2' });
  await expect(page.locator(`#col-2 #more-${key}`)).toHaveCount(1);
  await expect(page.locator(`#col-1 #more-${key}`)).toHaveCount(0);
});
