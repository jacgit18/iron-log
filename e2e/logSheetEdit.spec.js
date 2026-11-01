import { test, expect } from './fixtures.js';

// The Log button on a card that is already checked off opens the logged session to correct (EditEntry), not a blank form;
// on a skipped card with nothing logged it opens the blank form (saving brings the card back), with a session logged it opens that session with Undo skip. A unit test cannot show the wiring between the card, the store and the sheet.
const CARD = 'A-d1s1';

async function logSet(page, weight, reps) {
  await page.click(`#log-${CARD}-0`);
  await page.waitForSelector('#f-d');
  await page.fill('input[aria-label^="Set 1 weight"]', String(weight));
  await page.fill('input[aria-label^="Set 1 reps"]', String(reps));
  await page.click('button:has-text("Save set")');
  await expect(page.locator('#f-d')).toHaveCount(0);
}

test('an unchecked card opens the blank form', async ({ page }) => {
  await page.click(`#log-${CARD}-0`);
  await expect(page.locator('#f-d')).toBeVisible();
  await expect(page.getByText('Logged', { exact: true })).toHaveCount(0);
});

test('a logged card opens its session to edit; saving changes it in place', async ({ page }) => {
  await logSet(page, 100, 8);
  await expect(page.locator(`#chk-${CARD}`)).toBeChecked();
  await page.click(`#log-${CARD}-0`);
  await expect(page.getByText('Logged', { exact: true })).toBeVisible();
  const w = page.locator('input[aria-label^="Set 1 weight"]');
  await expect(w).toHaveValue('100');
  await w.fill('105');
  await page.click('button:has-text("Save changes")');
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator(`#chk-${CARD}`)).toBeChecked();
  await page.click(`#log-${CARD}-0`);
  await expect(page.locator('input[aria-label^="Set 1 weight"]')).toHaveValue('105');
  await expect(page.locator('.hist-recent tbody tr')).toHaveCount(1); // edited, not added
});

test('a plain check-off opens the planned session to edit', async ({ page }) => {
  await page.check(`#chk-${CARD}`);
  await page.click(`#log-${CARD}-0`);
  await expect(page.getByText('Logged', { exact: true })).toBeVisible();
});

test('Uncheck and remove deletes the session and unchecks the card', async ({ page }) => {
  await logSet(page, 100, 8);
  await page.click(`#log-${CARD}-0`);
  await page.click('button:has-text("Uncheck and remove")');
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator(`#chk-${CARD}`)).not.toBeChecked();
});

test('a skipped card has a Log button; saving brings the card back, checked', async ({ page }) => {
  await page.locator(`.card:has(#log-${CARD}-0)`).getByRole('button', { name: /^More actions/ }).click();
  await page.click(`#skip-${CARD}`);
  await expect(page.locator(`.card.skipped`).first()).toBeVisible();
  await expect(page.locator(`#log-${CARD}-0`)).toBeVisible();
  await logSet(page, 90, 10);
  await expect(page.locator(`#chk-${CARD}`)).toBeChecked();
  await expect(page.locator('.card.skipped')).toHaveCount(0);
});

test('a skipped card with a logged session opens it to edit, with Undo skip', async ({ page }) => {
  await logSet(page, 100, 8);
  await page.locator(`.card:has(#log-${CARD}-0)`).getByRole('button', { name: /^More actions/ }).click();
  await page.click(`#skip-${CARD}`);
  await expect(page.locator('.card.skipped').first()).toBeVisible();
  await page.click(`#log-${CARD}-0`);
  await expect(page.getByText('Skipped this week').last()).toBeVisible();
  await expect(page.locator('input[aria-label^="Set 1 weight"]')).toHaveValue('100');
  await page.locator('.sheet').getByRole('button', { name: 'Undo skip' }).click();
  await expect(page.locator('.card.skipped')).toHaveCount(0);
  await expect(page.locator(`#chk-${CARD}`)).toBeChecked(); // a logged session means it was done
});

test('a skipped superset exercise with a logged session opens it, and Undo skip brings back just that exercise', async ({ page }) => {
  const card = page.locator('article.card.group').filter({ has: page.locator('.tag', { hasText: 'Superset' }) }).first();
  await card.getByRole('button', { name: /^More actions/ }).click();
  await card.locator('[id^="skipi-"]').first().click();
  const log = card.locator('[id^="log-"]').first();
  await log.click(); // nothing logged yet: the blank form; saving without the check-off leaves the exercise skipped
  await page.waitForSelector('#f-d');
  await page.fill('input[aria-label^="Set 1 weight"]', '70');
  await page.fill('input[aria-label^="Set 1 reps"]', '10');
  await page.getByLabel('Check off this exercise').uncheck();
  await page.click('button:has-text("Save set")');
  await expect(page.locator('#f-d')).toHaveCount(0);
  await expect(card.locator('.iskipped')).toHaveCount(1);
  await log.click();
  await expect(page.getByText('Skipped this week').last()).toBeVisible();
  await expect(page.locator('input[aria-label^="Set 1 weight"]')).toHaveValue('70');
  await page.locator('.sheet').getByRole('button', { name: 'Undo skip' }).click();
  await expect(card.locator('.iskipped')).toHaveCount(0);
});
