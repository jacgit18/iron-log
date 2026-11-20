import { test, expect } from './fixtures.js';
import { startFood, startRecipe } from './recipesNav.js';

// Recipe safer editing (brief recipe-safer-editing): finished ingredient rows fold, Back and Cancel ask before losing edits, Remove has Undo, Enter moves
// forward and never saves. The rules are node tests (recipeSaferEditing.test.ts); this covers the wiring a node test cannot see.
const open = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); await startRecipe(page); };
const name = (page, i) => page.getByLabel(`Ingredient ${i + 1}`, { exact: true });
const amountBtn = (page, i) => page.getByRole('button', { name: new RegExp(`^Amount for ingredient ${i + 1}:`) });
const setAmount = async (page, i, text) => {
  await amountBtn(page, i).click();
  await page.getByLabel('Type an amount instead').fill(text);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
};

test('a row with a name and an amount folds and the next unfinished row opens', async ({ page }) => {
  await open(page);
  await name(page, 0).fill('Chicken breast');
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  await setAmount(page, 0, '200 g');
  await expect(page.getByRole('button', { name: 'Ingredient 1: Chicken breast · 200 g. Edit' })).toBeVisible();
  await expect(name(page, 0)).toHaveCount(0);
  await expect(name(page, 1)).toBeVisible(); // the unfinished row is open
  await page.getByRole('button', { name: 'Ingredient 1: Chicken breast · 200 g. Edit' }).click(); // tapping the folded row opens it again
  await expect(name(page, 0)).toBeFocused();
  await expect(name(page, 0)).toHaveValue('Chicken breast');
});

test('finishing the last amount focuses Save, and Enter in a name opens its amount', async ({ page }) => {
  await open(page);
  await name(page, 0).fill('Rice');
  await name(page, 0).press('Enter');
  await expect(page.getByRole('group', { name: 'Amount for Rice' })).toBeVisible();
  await page.getByLabel('Type an amount instead').fill('1 cup');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save recipe' })).toBeFocused();
});

test('Enter never saves the recipe', async ({ page }) => {
  await open(page);
  await page.getByLabel('Name', { exact: true }).fill('Soup');
  await page.getByLabel('Name', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible();
  await expect(page).toHaveURL(/#\/daily\/recipes\/form/);
});

test('tapping a name selects its text so typing replaces it', async ({ page }) => {
  await open(page);
  await name(page, 0).fill('Rice');
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  await name(page, 0).focus();
  const selected = await name(page, 0).evaluate(el => el.selectionStart === 0 && el.selectionEnd === el.value.length);
  expect(selected).toBe(true);
  await page.keyboard.type('Quinoa');
  await expect(name(page, 0)).toHaveValue('Quinoa');
});

test('Back with edits asks, Keep editing stays, Discard leaves; a clean form leaves at once', async ({ page }) => {
  await open(page);
  await page.goBack(); // nothing typed: no question
  await expect(page.locator('#recipes-new')).toBeVisible();
  await startRecipe(page);
  await page.getByLabel('Name', { exact: true }).fill('Soup');
  await page.goBack();
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toBeVisible();
  await expect(page).toHaveURL(/#\/daily\/recipes\/form/);
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Soup');
  await page.getByRole('button', { name: 'Cancel' }).click(); // Cancel asks the same
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.locator('#recipes-new')).toBeVisible();
});

test('Back with the amount picker open closes only the picker', async ({ page }) => {
  await open(page);
  await amountBtn(page, 0).click();
  await expect(page.getByRole('group', { name: /^Amount for/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('group', { name: /^Amount for/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toHaveCount(0);
  await page.goBack(); // the next Back leaves
  await expect(page.locator('#recipes-new')).toBeVisible();
});

test('Remove shows Undo and Undo puts the row back where it was', async ({ page }) => {
  await open(page);
  await name(page, 0).fill('Rice');
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  await name(page, 1).fill('Beans');
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  await name(page, 2).fill('Corn');
  await page.getByRole('button', { name: 'More for ingredient 2' }).click();
  await page.getByRole('button', { name: 'Remove ingredient 2' }).click();
  await expect(page.getByText('Removed Beans.')).toBeVisible();
  await expect(name(page, 1)).toHaveValue('Corn');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(name(page, 1)).toHaveValue('Beans');
  await expect(name(page, 2)).toHaveValue('Corn');
  await page.getByRole('button', { name: 'More for ingredient 3' }).click();
  await page.getByRole('button', { name: 'Remove ingredient 3' }).click();
  await expect(page.getByText('Removed Corn.')).toBeVisible();
  await expect(page.getByText('Removed Corn.')).toHaveCount(0, { timeout: 8000 }); // the notice goes after 5 seconds
});

// Review fixes for PR 1053.
const fillRows = async (page, rows) => {
  for (const [i, [n, amt]] of rows.entries()) {
    if (i > 0) await page.getByRole('button', { name: 'Add ingredient' }).click();
    await name(page, i).fill(n);
    await setAmount(page, i, amt);
  }
};

test('Removing a blank row or a second row keeps the first row’s Undo', async ({ page }) => {
  await open(page);
  await fillRows(page, [['Rice', '1 cup'], ['Beans', '2 cups'], ['Corn', '3 cups']]);
  await page.getByRole('button', { name: 'More for ingredient 1' }).click();
  await page.getByRole('button', { name: 'Remove ingredient 1' }).click();
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  await page.getByRole('button', { name: 'More for ingredient 3' }).click();
  await page.getByRole('button', { name: 'Remove ingredient 3' }).click(); // a blank row: no Undo of its own, and the Rice one stays
  await page.getByRole('button', { name: 'More for ingredient 1' }).click();
  await page.getByRole('button', { name: 'Remove ingredient 1' }).click(); // Beans, a second real row
  await expect(page.getByRole('button', { name: 'Undo remove Rice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo remove Beans' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo remove Beans' }).click();
  await page.getByRole('button', { name: 'Undo remove Rice' }).click();
  await expect(page.getByRole('button', { name: /^Ingredient 1: Rice/ })).toBeVisible();
});

test('Undo keeps the right row open', async ({ page }) => {
  await open(page);
  await fillRows(page, [['Rice', '1 cup'], ['Beans', '2 cups'], ['Corn', '3 cups']]);
  await page.getByRole('button', { name: /^Ingredient 3: Corn/ }).click(); // Corn is the open row
  await page.getByRole('button', { name: 'More for ingredient 1' }).click();
  await page.getByRole('button', { name: 'Remove ingredient 1' }).click();
  await page.getByRole('button', { name: 'Undo remove Rice' }).click();
  await expect(name(page, 2)).toHaveValue('Corn'); // still open, now at row 3
  await expect(page.getByRole('button', { name: /^Ingredient 2: Beans/ })).toBeVisible(); // Beans stayed folded
});

test('Back after switching to Type a list closes nothing and leaves at once', async ({ page }) => {
  await open(page);
  await amountBtn(page, 0).click();
  await page.getByRole('button', { name: 'Type a list' }).click();
  await page.goBack();
  await expect(page.locator('#recipes-new')).toBeVisible();
});

test('Enter in other fields moves to the next field and the last one to Save, never saving', async ({ page }) => {
  await open(page);
  await page.getByLabel('Name', { exact: true }).fill('Soup');
  await page.getByLabel('Name', { exact: true }).press('Enter');
  await expect(page.getByLabel('Name', { exact: true })).not.toBeFocused();
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible();
  const link = page.getByLabel('Video link (optional)');
  await link.press('Enter');
  await expect(page.getByRole('button', { name: 'Save recipe' })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible();
});

test('Clearing an amount keeps focus on that row instead of jumping to Save', async ({ page }) => {
  await open(page);
  await fillRows(page, [['Rice', '1 cup']]);
  await page.getByRole('button', { name: /^Ingredient 1: Rice/ }).click();
  await amountBtn(page, 0).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(amountBtn(page, 0)).toBeFocused();
  await expect(page.getByRole('button', { name: 'Save recipe' })).not.toBeFocused();
});

// Leave-guard gaps (brief n/a: follow-up fix to recipe-safer-editing). The Daily section buttons are another way out of the form: with edits they ask too.
const expectGrocery = async page => {
  await expect(page.locator('#daily-grocery')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#daily-recipes')).toHaveAttribute('aria-pressed', 'false');
  await expect(page).toHaveURL(/#\/daily\/grocery/);
  await expect(page.getByRole('heading', { name: 'New recipe' })).toHaveCount(0);
};
test('Switching Daily section with edits asks, Keep editing stays, Discard leaves the form', async ({ page }) => {
  await open(page);
  await page.getByLabel('Name', { exact: true }).fill('Soup');
  await page.click('#daily-grocery');
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Soup');
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Soup');
  await page.click('#daily-grocery'); // asks again
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard' }).click();
  await expectGrocery(page); // Discard finishes the switch: the tapped section opens, no second tap
});

test('Switching Daily section from a clean form leaves at once', async ({ page }) => {
  await open(page);
  await page.click('#daily-grocery');
  await expect(page.locator('#daily-grocery')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toHaveCount(0);
});

// The guarded Back puts its history entry back; these walk the stack so it stays one form entry above the list.
const hist = page => page.evaluate(() => ({ hash: location.hash, len: history.length }));
test('History: Keep editing then Back asks again, Discard then Back leaves the Recipes list', async ({ page }) => {
  await open(page);
  await page.getByLabel('Name', { exact: true }).fill('Soup');
  const before = await hist(page);
  await page.goBack();
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.goBack();
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toBeVisible();
  expect((await hist(page)).hash).toBe(before.hash);
  expect((await hist(page)).len).toBe(before.len); // the entry was put back, not stacked
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.locator('#recipes-new')).toBeVisible();
  await expect(page).toHaveURL(/#\/daily\/recipes$/);
});

test('History: a second Back after a held Back keeps the form and asks again', async ({ page }) => {
  await open(page);
  await page.getByLabel('Name', { exact: true }).fill('Soup');
  await page.goBack();
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toBeVisible();
  await expect(page).toHaveURL(/#\/daily\/recipes\/form/); // the entry is back before the next Back
  await page.goBack();
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Soup');
  await expect(page).toHaveURL(/#\/daily\/recipes\/form/);
});

test('History: Forward after a held Back stays on the form', async ({ page }) => {
  await open(page);
  await page.getByLabel('Name', { exact: true }).fill('Soup');
  await page.goBack();
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toBeVisible();
  await page.goForward(); // nothing ahead: the put-back entry is the top one
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Soup');
  await expect(page).toHaveURL(/#\/daily\/recipes\/form/);
});

test('Switching Daily section from a food form with edits asks; Discard opens the section, a clean one leaves at once', async ({ page }) => {
  await page.click('#tab-daily'); await page.click('#daily-recipes'); await startFood(page);
  await page.getByLabel('Name', { exact: true }).fill('Granola');
  await page.click('#daily-grocery');
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Granola');
  await page.getByRole('button', { name: 'Cancel' }).click(); // Cancel asks the same
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.click('#daily-grocery');
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.locator('#daily-grocery')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#daily-recipes'); await startFood(page); // nothing typed: the tap opens the section at once
  await page.click('#daily-grocery');
  await expect(page.locator('#daily-grocery')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toHaveCount(0);
});

// A section tap with the amount picker open closes the picker and then goes on (a clean form switches, one with edits asks); it never looks ignored. Back differs: it takes two steps.
test('A Daily section tap with the amount picker open closes it and goes on', async ({ page }) => {
  await open(page);
  await amountBtn(page, 0).click();
  await expect(page.getByRole('group', { name: /^Amount for/ })).toBeVisible();
  await page.click('#daily-grocery');
  await expectGrocery(page); // nothing was typed: the section opens
  await page.click('#daily-recipes'); await startRecipe(page);
  await page.getByLabel('Name', { exact: true }).fill('Soup');
  await amountBtn(page, 0).click();
  await page.click('#daily-grocery');
  await expect(page.getByRole('group', { name: /^Amount for/ })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Discard changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard' }).click();
  await expectGrocery(page);
});
