import { test, expect } from './fixtures.js';

// Groceries, keyboard and screen reader details: focus stays put when an edit row opens, closes, moves store or is removed; accessible names carry the
// visible words; aria-controls points at something that exists; a retired store still shows; To get's tile counts a removed item's bought line.
// The fixed date is in September 2026 (month 2026-09).
const item = (id, n, store, cents, over = {}) => ({ id, n, store, qty: 1, cents, every: true, out: false, ...over });
const CAT = { stores: ["BJ's", 'Aldi'], items: [item('tp', 'Toilet paper', "BJ's", 2499), item('rice', 'Rice', "BJ's", 500), item('milk', 'Milk', 'Aldi', 399)] };
const seed = async (page, { cat = CAT, month = { lines: {}, pulled: [] }, edit = false } = {}) => {
  await page.evaluate(({ cat, month }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(cat));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(month));
  }, { cat, month });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  if (edit) { await page.click('#groc-view-home'); await page.click('#groc-edit'); }
};
const focusedName = page => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName);

test('an edit row keeps focus on its arrow when it opens and closes from the keyboard', async ({ page }) => {
  await seed(page, { edit: true });
  await page.getByRole('button', { name: 'Expand Rice' }).focus();
  await page.keyboard.press('Enter');
  expect(await focusedName(page)).toBe('Collapse Rice');
  await page.keyboard.press('Enter');
  expect(await focusedName(page)).toBe('Expand Rice');
});

test('moving an edit row to another store keeps focus on its Store select', async ({ page }) => {
  await seed(page, { edit: true });
  await page.getByRole('button', { name: 'Expand Rice' }).click();
  await page.getByLabel('Store for Rice').selectOption('Aldi');
  await expect(page.getByLabel('Store for Rice')).toBeFocused();
});

test('removing an edit row puts focus on the next row\'s arrow, else the one before', async ({ page }) => {
  await seed(page, { edit: true });
  await page.getByRole('button', { name: 'Expand Toilet paper' }).click();
  await page.getByRole('button', { name: 'Remove Toilet paper from your list' }).click();
  await page.getByRole('button', { name: 'Remove Toilet paper from your list' }).click();
  await expect(page.getByRole('button', { name: 'Expand Milk' })).toBeFocused(); // the screen is A to Z: Rice, Toilet paper, Milk (Aldi)
  await page.getByRole('button', { name: 'Expand Milk' }).click();
  await page.getByRole('button', { name: 'Remove Milk from your list' }).click();
  await page.getByRole('button', { name: 'Remove Milk from your list' }).click();
  await expect(page.getByRole('button', { name: 'Expand Rice' })).toBeFocused(); // nothing after Milk: the row before
});

test('a rejected rename shows its message, and closing the row reverts the field and clears the message', async ({ page }) => {
  await seed(page, { edit: true });
  await page.getByRole('button', { name: 'Expand Toilet paper' }).click();
  await page.getByLabel('Name of Toilet paper').fill('Rice');
  await page.getByLabel('Name of Toilet paper').blur();
  await expect(page.locator('li.gedit p.gerr')).toBeVisible();
  await page.getByRole('button', { name: 'Collapse Toilet paper' }).click();
  await page.getByRole('button', { name: 'Expand Toilet paper' }).click();
  await expect(page.getByLabel('Name of Toilet paper')).toHaveValue('Toilet paper');
  await expect(page.locator('li.gedit p.gerr')).toHaveCount(0);
});

test('the count and price button and Make usual button names start with their visible words, and aria-controls always finds its panel', async ({ page }) => {
  await seed(page);
  const qty = page.locator('button.gqty', { hasText: 'Toilet paper' }).or(page.getByRole('button', { name: /Count and price of Toilet paper/i }));
  await expect(qty).toHaveAttribute('aria-label', '1 × $24.99, count and price of Toilet paper');
  const ctl = await qty.getAttribute('aria-controls');
  expect(await page.locator(`[id="${ctl}"]`).count()).toBe(1); // closed: the panel exists (hidden)
  await expect(page.locator(`[id="${ctl}"]`)).toBeHidden();
  await qty.click();
  await expect(page.locator(`[id="${ctl}"]`)).toBeVisible();
  await page.getByLabel('Store for Toilet paper this month').selectOption('Aldi');
  const usual = page.getByRole('button', { name: /usual store for Toilet paper/ });
  await expect(usual).toHaveText('Make Aldi its usual store');
  await expect(usual).toHaveAttribute('aria-label', 'Make Aldi its usual store for Toilet paper');
  await expect(page.locator('#groc-money')).toHaveCount(0); // no sharing: no money line
});

test('open rows fold again when the month changes', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: /Count and price of Rice/i }).click();
  await expect(page.getByLabel('Count of Rice')).toBeVisible();
  await page.click('#groc-next'); await page.click('#groc-prev');
  await expect(page.getByLabel('Count of Rice')).toHaveCount(0);
});

test('the Spent tile, the count and the tax hint include a bought line whose item was removed', async ({ page }) => {
  const month = { lines: { gone: { got: true, qty: 2, cents: 300, store: "BJ's" }, rice: { got: true } }, tax: { "BJ's": 60 }, pulled: [] };
  await seed(page, { month });
  const summary = page.locator('#groc-summary');
  await expect(summary).toContainText('Got 2 of 4'); // rice, and the removed item's line, of three items plus the removed one
  await expect(summary).toContainText('Spent $11.60 with tax'); // 500 + 2 x 300 + 60 tax
  await page.click('#groc-view-spend');
  await expect(page.locator('.groc')).toContainText('$11.60');
});
