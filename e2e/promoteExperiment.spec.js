import { test, expect, seedExperiments } from './fixtures.js';

// Experiments: To program opens the add-to-program sheet from the entry, and saving it takes the entry off the list; Undo puts it back.
test('To program on a workout experiment adds it to the program and takes it off the list', async ({ page }) => {
  await page.goto('/');
  await seedExperiments(page, ['hack']);
  await page.goto('/');
  const card = page.locator('.explist .expcard');
  await expect(card).toHaveCount(1);
  const name = (await card.locator('.rmname').innerText()).trim();
  const boardCards = page.locator('article.card');
  const before = await boardCards.count();
  await card.getByRole('button', { name: /to the program, Day/ }).click();
  await expect(page.locator('#slot-ex-0')).toHaveValue(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(card).toHaveCount(0);
  await expect(boardCards).toHaveCount(before + 1); // the new program card is on the board
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(card).toHaveCount(1);
  await expect(boardCards).toHaveCount(before); // one Undo takes the card out again as well as bringing the entry back
});

test('To my stretches moves a stretch experiment into your stretches', async ({ page }) => {
  await page.goto('/');
  await page.click('#board-stretches');
  await page.click('#sexp-add');
  await page.fill('#sexp-name', 'Frog Stretch');
  await page.keyboard.press('Enter'); // nothing highlighted in the picker, so Enter submits the sheet
  const card = page.locator('.explist .expcard');
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: /to your stretches/ }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(card).toHaveCount(1);
});
