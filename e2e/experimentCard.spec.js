import { test, expect, seedExperiments } from './fixtures.js';

// Both Experiments lists use one card: Delete needs a second tap (the card is marked while armed), and Undo brings it back.
test('a workout experiment card arms Delete, deletes on the second tap and Undo brings it back', async ({ page }) => {
  await page.goto('/');
  await seedExperiments(page, ['hack']);
  await page.goto('/');
  const card = page.locator('.explist .expcard');
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: /delete/i }).click();
  await expect(card).toHaveClass(/removing/);
  await expect(card.locator('.rmtag')).toContainText('tap Delete again');
  await card.getByRole('button', { name: /delete/i }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(card).toHaveCount(1);
  await expect(card).not.toHaveClass(/removing/);
});

test('a stretch experiment card adds to a day, arms Delete, deletes and Undo brings it back', async ({ page }) => {
  await page.goto('/');
  await page.click('#board-stretches');
  await page.click('#sexp-add');
  await page.fill('#sexp-name', 'Frog Stretch');
  await page.keyboard.press('Enter');
  const card = page.locator('.explist .expcard');
  await expect(card).toHaveCount(1);
  await card.locator('select').selectOption('3');
  await card.getByRole('button', { name: 'Add Frog Stretch to Wednesday' }).click();
  await expect(page.locator('.strroot')).toContainText('Frog Stretch');
  await card.getByRole('button', { name: /delete frog stretch/i }).click();
  await expect(card).toHaveClass(/removing/);
  await card.getByRole('button', { name: /delete frog stretch/i }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(card).toHaveCount(1);
});
