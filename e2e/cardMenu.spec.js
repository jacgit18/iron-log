import { test, expect, seedExperiments, openFinished, addIdeaToDay } from './fixtures.js';

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

test('Skip marks the card, and Undo skip on its Finished row brings it back', async ({ page }) => {
  const card = first(page);
  const id = await card.getByRole('button', { name: /^More actions:/ }).getAttribute('id');
  const key = id.replace('more-', '');
  await card.getByRole('button', { name: /^More actions:/ }).click();
  await page.locator(`#skip-${key}`).click();
  // A skipped card is folded into the Finished bar (no card, no ⋯ menu, no Move to), and Undo skip is on its row instead of on the card.
  await expect(page.locator(`#more-${key}`)).toHaveCount(0);
  await expect(page.locator('#finished-bar-1')).toContainText('1 skipped');
  await openFinished(page);
  await expect(page.locator(`#fin-undo-${key}`)).toHaveAccessibleName(/^Undo skip for /);
  await page.locator(`#fin-undo-${key}`).click();
  await expect(page.locator(`#fin-undo-${key}`)).toHaveCount(0);
  await expect(page.locator(`#more-${key}`)).toBeVisible();
});

test('Move to sends the card to another day', async ({ page }) => {
  const card = first(page);
  const key = (await card.getByRole('button', { name: /^More actions:/ }).getAttribute('id')).replace('more-', '');
  await card.getByRole('button', { name: /^More actions:/ }).click();
  await page.locator(`#mv-${key}`).selectOption({ label: 'Day 2' });
  await expect(page.locator(`#col-2 #more-${key}`)).toHaveCount(1);
  await expect(page.locator(`#col-1 #more-${key}`)).toHaveCount(0);
});

test('after Skip focus lands on the Finished bar, and after Undo skip on the bar or the day title', async ({ page }) => {
  const card = first(page);
  const key = (await card.getByRole('button', { name: /^More actions:/ }).getAttribute('id')).replace('more-', '');
  await card.getByRole('button', { name: /^More actions:/ }).click();
  await page.locator(`#skip-${key}`).click();
  await expect(page.locator('#finished-bar-1')).toBeFocused(); // was: the card's Undo skip button
  await openFinished(page);
  await page.locator(`#fin-undo-${key}`).click();
  // The card is back and the bar is gone (it was the only finished card): focus goes to the day's title (was: the card's ⋯).
  await expect(page.locator('#finished-bar-1')).toHaveCount(0);
  await expect(page.locator('#colh-1')).toBeFocused();
});

test('on an experiment card Remove needs a second tap, keeps its panel open meanwhile, and ⋯ folds it again', async ({ page }) => {
  await seedExperiments(page, ['hack']);
  await page.goto('/');
  const entry = page.locator('.explist .expcard');
  const name = (await entry.locator('.rmname').innerText()).trim();
  await addIdeaToDay(page, entry, 1);
  const card = page.locator('#col-1 article.card').filter({ hasText: name }).first();
  const more = card.getByRole('button', { name: /^More actions:/ });
  await more.click();
  const remove = card.getByRole('button', { name: /^Remove / });
  await remove.click();
  await expect(card.getByRole('button', { name: /^Tap again to remove/ })).toBeVisible();
  // ⋯ while Remove is armed folds the panel and disarms it (on a phone the tap does not blur the button first)
  await more.dispatchEvent('click');
  await expect(card.getByRole('combobox', { name: /^Move to/ })).toHaveCount(0);
  await more.click();
  await expect(card.getByRole('button', { name: /^Remove / })).toBeVisible();
  await card.getByRole('button', { name: /^Remove / }).click();
  await card.getByRole('button', { name: /^Tap again to remove/ }).click();
  await expect(page.locator('#col-1 article.card').filter({ hasText: name })).toHaveCount(0);
});
