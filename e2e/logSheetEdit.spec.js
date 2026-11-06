import { test, expect, openFinished } from './fixtures.js';

// The Log button on a card that is already checked off opens the logged session to correct (EditEntry), not a blank form;
// on a skipped card with nothing logged it opens the blank form (saving brings the card back), with a session logged it opens that session with Undo skip. A unit test cannot show the wiring between the card, the store and the sheet.
const CARD = 'A-d1s1';
// A done card is folded into the Finished bar; its Edit button is the row's `#fin-log-<key>` and its Untick button `#fin-undo-<key>`.
const finLog = async page => { await openFinished(page); return page.locator(`#fin-log-${CARD}`); };
const untick = async page => { await openFinished(page); await page.locator(`#fin-undo-${CARD}`).click(); };

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
  await expect(page.locator(`#chk-${CARD}`)).toHaveCount(0); // checked: folded into the Finished bar
  await expect(await finLog(page)).toHaveText('Edit');
  await (await finLog(page)).click();
  await expect(page.getByText('Logged', { exact: true })).toBeVisible();
  const w = page.locator('input[aria-label^="Set 1 weight"]');
  await expect(w).toHaveValue('100');
  await w.fill('105');
  await page.click('button:has-text("Save changes")');
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator(`#chk-${CARD}`)).toHaveCount(0); // still checked (still in the Finished bar)
  await expect(await finLog(page)).toBeVisible();
  await (await finLog(page)).click();
  await expect(page.locator('input[aria-label^="Set 1 weight"]')).toHaveValue('105');
  await expect(page.locator('.hist-recent tbody tr')).toHaveCount(1); // edited, not added
});

test('a plain check-off opens the planned session to edit', async ({ page }) => {
  await page.click(`#chk-${CARD}`);
  await (await finLog(page)).click();
  await expect(page.getByText('Logged', { exact: true })).toBeVisible();
});

test('Uncheck and remove deletes the session and unchecks the card', async ({ page }) => {
  await logSet(page, 100, 8);
  await (await finLog(page)).click();
  await page.click('button:has-text("Uncheck and remove")');
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator(`#chk-${CARD}`)).not.toBeChecked(); // back on the page as an open card
  await expect(page.locator('#finished-bar-1')).toHaveCount(0);
});

test('a skipped card has a Log button; saving brings the card back, checked', async ({ page }) => {
  await page.locator(`.card:has(#log-${CARD}-0)`).getByRole('button', { name: /^More actions/ }).click();
  await page.click(`#skip-${CARD}`);
  // Changed: a skipped card is folded into the Finished bar and its row has only Undo skip, no Log button. Undo skip brings the open card (with
  // its Log button) back; saving a logged set then checks it off and it folds into the bar as done.
  await openFinished(page);
  await expect(page.locator(`#fin-log-${CARD}`)).toHaveCount(0);
  await expect(page.locator('#finished-bar-1')).toContainText('1 skipped');
  await page.locator(`#fin-undo-${CARD}`).click();
  await expect(page.locator(`#log-${CARD}-0`)).toBeVisible();
  await logSet(page, 90, 10);
  await expect(page.locator('#finished-bar-1')).toContainText('1 done');
  await expect(page.locator('#finished-bar-1')).not.toContainText('skipped');
  await expect(await finLog(page)).toHaveText('Edit');
});

test('a skipped card with a logged session opens it to edit, with Undo skip', async ({ page }) => {
  await logSet(page, 100, 8);
  // Changed: a finished card has no ⋯ menu, so untick it, skip it from the menu, and Undo skip from its Finished row (the skipped row has no Log
  // button, so the "Skipped this week" sheet is no longer reachable from the board). A logged session means it comes back done.
  await untick(page);
  await page.locator(`.card:has(#log-${CARD}-0)`).getByRole('button', { name: /^More actions/ }).click();
  await page.click(`#skip-${CARD}`);
  await expect(page.locator('.card.skipped')).toHaveCount(0);
  await openFinished(page);
  await expect(page.locator(`#fin-log-${CARD}`)).toHaveCount(0);
  await page.locator(`#fin-undo-${CARD}`).click();
  await expect(page.locator('#finished-bar-1')).toHaveCount(0);
  await expect(page.locator(`#log-${CARD}-0`)).toBeVisible();
  // Unticking first (needed to reach the ⋯ menu) drops the card's done state, so it comes back open, not done: the old "logged means done" check cannot be reached.
  await expect(page.locator(`#chk-${CARD}`)).not.toBeChecked();
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

test('a logged card lists its recent sessions, and any of them opens in the edit form', async ({ page }) => {
  await logSet(page, 100, 8);
  await page.evaluate(() => { // an older session of the same exercise, in place before the page reloads
    const key = Object.keys(localStorage).find(k => k.startsWith('ironlog:logs/'));
    const doc = JSON.parse(localStorage.getItem(key));
    doc.entries.unshift({ id: 'old1', d: '2026-09-08', w: 50, s: 3, r: 10, ph: null });
    localStorage.setItem(key, JSON.stringify(doc));
  });
  await page.reload();
  await (await finLog(page)).click();
  await expect(page.locator('input[aria-label^="Set 1 weight"]')).toHaveValue('100'); // this week's session first
  await expect(page.getByText('Sep 24 · Editing')).toBeVisible();
  await page.getByRole('button', { name: 'Sep 8 · Edit entry' }).click();
  await expect(page.locator('input[aria-label^="Set 1 weight"]')).toHaveValue('50');
  await expect(page.getByText('Sep 8 · Editing')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Uncheck and remove' })).toHaveCount(0); // that button is for this card's session only
  await page.locator('input[aria-label^="Set 1 weight"]').fill('55');
  await page.click('button:has-text("Save changes")');
  await expect(page.locator('.sheet')).toHaveCount(0);
  await (await finLog(page)).click();
  await expect(page.locator('.hist-recent tbody tr').filter({ hasText: '55 lb' })).toHaveCount(1);
});
