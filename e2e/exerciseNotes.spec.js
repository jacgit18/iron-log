import { test, expect } from './fixtures.js';

// A note belongs to the exercise (brief exercise-notes-persist): written in one Note field, it shows on the Board card, the Ideas card and
// an Add-to-day card of the same exercise, and editing it from another sheet changes it everywhere. A unit test cannot see the sheets and cards agree.
const NAME = 'Farmer Carry Test';
const dialog = page => page.getByRole('dialog');
const note = dialog => dialog.getByLabel(`Note (shown on every ${NAME})`);

test('one note on an exercise shows on every card and sheet, and an edit from another sheet changes all of them', async ({ page }) => {
  // Program card sheet: the label says the note is shared, and saving writes it onto the exercise.
  await page.click('#tab-program');
  await page.getByRole('button', { name: '+ Add exercise', exact: true }).click();
  await dialog(page).getByRole('combobox', { name: /Exercise/ }).fill(NAME);
  await note(dialog(page)).fill('Keep your ribs down');
  await page.uncheck('#slot-day-1'); await page.check('#slot-day-5'); // Day 5 is still ahead on the fixed Thursday, so the card starts this week
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expect(dialog(page)).toHaveCount(0);

  // Board card for the exercise (Day 5) prints it.
  await page.click('#tab-board');
  const onBoard = page.locator('article', { hasText: NAME });
  await expect(onBoard.first().locator('.note', { hasText: 'Keep your ribs down' })).toBeVisible();

  // Ideas to try: the same exercise starts with the shared note, and the Ideas card shows it.
  await page.getByRole('button', { name: '+ Add idea' }).click();
  await dialog(page).getByRole('combobox', { name: /Exercise/ }).fill(NAME);
  await expect(note(dialog(page))).toHaveValue('Keep your ribs down');
  await note(dialog(page)).click(); // leaves the exercise box, so its suggestion list does not swallow the Save click
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  const idea = page.locator('.explist .expcard', { hasText: NAME });
  await expect(idea.locator('.note', { hasText: 'Keep your ribs down' })).toBeVisible();

  // Adding the idea to a day this week: that card shows the exercise's note, not a copy.
  await idea.getByRole('button', { name: /^Add / }).first().click();
  await dialog(page).getByRole('button', { name: 'Day 1', exact: true }).click();
  await expect(page.locator('article', { hasText: NAME })).toHaveCount(2);
  await expect(page.locator('article .note', { hasText: 'Keep your ribs down' })).toHaveCount(2);

  // Edit it from the Ideas sheet: every card changes at once, and it survives a reload.
  await idea.getByRole('button', { name: /^Edit/ }).click();
  await note(dialog(page)).fill('Brace hard');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('article .note', { hasText: 'Brace hard' })).toHaveCount(2);
  await expect(page.locator('article .note', { hasText: 'Keep your ribs down' })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('article .note', { hasText: 'Brace hard' })).toHaveCount(2);
  await expect(page.locator('.explist .expcard', { hasText: NAME }).locator('.note', { hasText: 'Brace hard' })).toBeVisible();

  // The Program card sheet opens with the same note, and clearing it there clears it everywhere.
  await page.click('#tab-program');
  await page.getByRole('group', { name: 'Jump to day' }).getByRole('button', { name: /^Day 5/ }).click();
  await page.locator('.edpanel:not(.lib) .edrow', { hasText: NAME }).getByRole('button', { name: /^Edit / }).click();
  await expect(note(dialog(page))).toHaveValue('Brace hard');
  await note(dialog(page)).fill('x'.repeat(250)); // the field stops at 200 characters
  expect((await note(dialog(page)).inputValue()).length).toBe(200);
  await note(dialog(page)).fill('');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await page.click('#tab-board');
  await expect(page.locator('article .note', { hasText: 'Brace hard' })).toHaveCount(0);
  await expect(page.locator('.explist .expcard', { hasText: NAME }).locator('.note', { hasText: 'Brace hard' })).toHaveCount(0);
});
