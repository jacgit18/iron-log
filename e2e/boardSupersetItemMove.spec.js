import { test, expect } from './fixtures.js';

// One exercise of a superset card goes to another day for this week only, from the card's ⋯ panel. The pure rules (nothing lost or duplicated,
// ticks, skips and phases follow, Undo exact, either/or and plain cards unchanged) are unit tests; these cover what a node test cannot: the
// control is in the folded panel of superset cards only, the card really lands in the other day's column, and the move survives a reload.
const supersetCard = page => page.locator('article.card.group').filter({ has: page.locator('.tag', { hasText: 'Superset' }) }).first();
const names = card => card.locator('.exh').allTextContents();
const column = (page, n) => page.locator('.col').nth(n - 1);

test('a superset exercise moves to another day for this week, shows in that column, and Undo puts it back', async ({ page }) => {
  const card = supersetCard(page);
  const [first, second] = await names(card);
  const has = (n, ex) => column(page, n).locator('.exh', { hasText: ex });
  const on4 = await has(4, first).count(); const on1 = await has(1, first).count();
  await card.getByRole('button', { name: /^More actions/ }).click();
  await card.getByRole('combobox', { name: `Move ${first} to another day (this week)` }).selectOption('4');
  await expect(page.getByRole('status').filter({ hasText: `${first} to Day 4` }).first()).toBeVisible();
  await expect(has(4, first)).toHaveCount(on4 + 1);
  await expect(has(1, first)).toHaveCount(on1 - 1);
  await expect(has(1, second)).not.toHaveCount(0); // the other exercise stays on its day
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expect(has(4, first)).toHaveCount(on4);
  await expect(supersetCard(page).locator('.exh')).toHaveText([first, second]);
});

test('the move is kept after a reload, and the ticked state goes with the exercise', async ({ page }) => {
  const card = supersetCard(page);
  const [first] = await names(card);
  const on3 = await column(page, 3).locator('.exh', { hasText: first }).count();
  await card.getByRole('checkbox', { name: `Mark ${first} done` }).check();
  await card.getByRole('button', { name: /^More actions/ }).click();
  await card.getByRole('combobox', { name: `Move ${first} to another day (this week)` }).selectOption('3');
  const moved = column(page, 3).locator('article.card').filter({ has: page.locator('.exh', { hasText: first }) }).last();
  await expect(moved.getByRole('checkbox', { name: `Mark ${first} done` })).toBeChecked();
  await page.reload();
  await expect(column(page, 3).locator('.exh', { hasText: first })).toHaveCount(on3 + 1);
});

test('plain and either/or cards have no per-exercise move, and neither does a closed superset', async ({ page }) => {
  const plain = page.locator('article.card:not(.group)').first();
  await plain.getByRole('button', { name: /^More actions/ }).click();
  await expect(plain.getByRole('combobox', { name: /another day \(this week\)/ })).toHaveCount(0);
  await expect(supersetCard(page).getByRole('combobox', { name: /another day \(this week\)/ })).toHaveCount(0);
  const either = page.locator('article.card.group').filter({ has: page.locator('.tag', { hasText: 'Either' }) }).first();
  if (await either.count()) {
    await either.getByRole('button', { name: /^More actions/ }).click();
    await expect(either.getByRole('combobox', { name: /another day \(this week\)/ })).toHaveCount(0);
  }
});

test('the day the exercise is already on cannot be picked', async ({ page }) => {
  const card = supersetCard(page);
  const [first] = await names(card);
  await card.getByRole('button', { name: /^More actions/ }).click();
  const sel = card.getByRole('combobox', { name: `Move ${first} to another day (this week)` });
  await expect(sel.locator('option', { hasText: '(here)' })).toBeDisabled();
});

test('Put back on the moved card regroups the superset after the Undo notice is gone', async ({ page }) => {
  const card = supersetCard(page);
  const [first, second] = await names(card);
  await card.getByRole('button', { name: /^More actions/ }).click();
  await card.getByRole('combobox', { name: `Move ${first} to another day (this week)` }).selectOption('4');
  const moved = column(page, 4).locator('article.card').filter({ has: page.locator('.exh', { hasText: first }) }).last();
  await moved.getByRole('button', { name: /^More actions/ }).click();
  await moved.getByRole('button', { name: /^Put back/ }).click();
  await expect(supersetCard(page).locator('.exh')).toHaveText([first, second]);
});
