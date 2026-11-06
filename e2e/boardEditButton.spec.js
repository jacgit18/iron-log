import AxeBuilder from '@axe-core/playwright';
import { test, expect, openFinished } from './fixtures.js';

// A checked-off card says Edit and its sheet says Edit mode (brief board-edit-button). The rule is a node test in src/lib/loggedEntry.test.ts; this covers
// the wiring a node test cannot see: the button on the card, the banner and Cancel on the sheet, that a skipped card keeps Log and its old sheet, and axe.
const CARD = 'A-d1s1';
// A done card is folded into the Finished bar, so its Edit button is the row's `#fin-log-<key>` (it opens the same sheet as the card's `#log-` button did).
const editBtn = async page => { await openFinished(page); return page.locator(`#fin-log-${CARD}`); };

async function logSet(page, weight, reps) {
  await page.click(`#log-${CARD}-0`);
  await page.waitForSelector('#f-d');
  await page.fill('input[aria-label^="Set 1 weight"]', String(weight));
  await page.fill('input[aria-label^="Set 1 reps"]', String(reps));
  await page.click('button:has-text("Save set")');
  await expect(page.locator('#f-d')).toHaveCount(0);
}

test('an unchecked card says Log, a checked card with a session says Edit', async ({ page }) => {
  const btn = page.locator(`#log-${CARD}-0`);
  await expect(btn).toHaveText('Log');
  await logSet(page, 100, 8);
  await expect(btn).toHaveCount(0); // the card folded into the Finished bar
  const edit = await editBtn(page);
  await expect(edit).toHaveText('Edit');
  await expect(edit).toHaveAttribute('aria-label', /^Edit /);
  const h = await edit.evaluate(el => el.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(36); // the small button size the Log button already had
  await page.locator(`#fin-undo-${CARD}`).click(); // Untick: the card is open again
  await expect(btn).toHaveText('Log');
});

test('Edit opens the sheet in Edit mode, with Cancel and Save changes, and a changed number saves', async ({ page }) => {
  await logSet(page, 100, 8);
  await (await editBtn(page)).click();
  const banner = page.locator('.editbanner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Edit mode');
  await expect(banner).toContainText('You are changing the session logged');
  await expect(page.getByText('Logged', { exact: true })).toBeVisible();
  await expect(page.locator('.sheet').getByRole('button', { name: 'Cancel' })).toBeVisible();
  await page.fill('input[aria-label^="Set 1 weight"]', '110');
  await page.click('button:has-text("Save changes")');
  await expect(page.locator('.sheet')).toHaveCount(0);
  await (await editBtn(page)).click();
  await expect(page.locator('input[aria-label^="Set 1 weight"]')).toHaveValue('110');
  await page.locator('.sheet').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
});

test('a skipped card is a Finished row with only Undo skip: no Log button, no banner, no sheet', async ({ page }) => {
  await logSet(page, 100, 8);
  // The done card is in the Finished bar, so untick it first (a finished card has no ⋯ menu), then skip it from its menu.
  await openFinished(page);
  await page.locator(`#fin-undo-${CARD}`).click();
  await page.locator(`.card:has(#log-${CARD}-0)`).getByRole('button', { name: /^More actions/ }).click();
  await page.click(`#skip-${CARD}`);
  // A skipped card is a row in the Finished bar with only Undo skip: it has no Log/Edit button and so no Edit-mode sheet at all.
  await expect(page.locator(`#log-${CARD}-0`)).toHaveCount(0);
  await openFinished(page);
  await expect(page.locator(`#fin-log-${CARD}`)).toHaveCount(0);
  await expect(page.locator('.editbanner')).toHaveCount(0);
  await expect(page.locator(`#fin-undo-${CARD}`)).toHaveAccessibleName(/^Undo skip for /);
  await page.locator(`#fin-undo-${CARD}`).click();
  await expect(page.locator(`#log-${CARD}-0`)).toBeVisible(); // back as an open card with Log
});

test('the Edit button and the Edit mode sheet have no accessibility violations', async ({ page }) => {
  await logSet(page, 100, 8);
  const board = await new AxeBuilder({ page }).analyze();
  expect(board.violations.filter(v => v.nodes.some(n => n.target.join(' ').includes('log-')))).toEqual([]);
  await (await editBtn(page)).click();
  await expect(page.locator('.editbanner')).toBeVisible();
  const sheet = await new AxeBuilder({ page }).include('.sheet').analyze();
  expect(sheet.violations).toEqual([]);
});
