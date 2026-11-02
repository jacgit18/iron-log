import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// A checked-off card says Edit and its sheet says Edit mode (brief board-edit-button). The rule is a node test in src/lib/loggedEntry.test.ts; this covers
// the wiring a node test cannot see: the button on the card, the banner and Cancel on the sheet, that a skipped card keeps Log and its old sheet, and axe.
const CARD = 'A-d1s1';

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
  await expect(btn).toHaveText('Edit');
  await expect(btn).toHaveAttribute('aria-label', /^Edit /);
  const h = await btn.evaluate(el => el.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(36); // the small button size the Log button already had
  await page.uncheck(`#chk-${CARD}`);
  await expect(btn).toHaveText('Log');
});

test('Edit opens the sheet in Edit mode, with Cancel and Save changes, and a changed number saves', async ({ page }) => {
  await logSet(page, 100, 8);
  await page.click(`#log-${CARD}-0`);
  const banner = page.locator('.editbanner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Edit mode');
  await expect(banner).toContainText('You are changing the session logged');
  await expect(page.getByText('Logged', { exact: true })).toBeVisible();
  await expect(page.locator('.sheet').getByRole('button', { name: 'Cancel' })).toBeVisible();
  await page.fill('input[aria-label^="Set 1 weight"]', '110');
  await page.click('button:has-text("Save changes")');
  await expect(page.locator('.sheet')).toHaveCount(0);
  await page.click(`#log-${CARD}-0`);
  await expect(page.locator('input[aria-label^="Set 1 weight"]')).toHaveValue('110');
  await page.locator('.sheet').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
});

test('a skipped card keeps Log, no banner and Close', async ({ page }) => {
  await logSet(page, 100, 8);
  await page.locator(`.card:has(#log-${CARD}-0)`).getByRole('button', { name: /^More actions/ }).click();
  await page.click(`#skip-${CARD}`);
  await expect(page.locator('.card.skipped').first()).toBeVisible();
  const btn = page.locator(`#log-${CARD}-0`);
  await expect(btn).toHaveText('Log');
  await btn.click();
  await expect(page.locator('.editbanner')).toHaveCount(0);
  await expect(page.locator('.sheet').getByRole('button', { name: 'Close' })).toBeVisible();
  await expect(page.locator('.sheet').getByRole('button', { name: 'Undo skip' })).toBeVisible();
});

test('the Edit button and the Edit mode sheet have no accessibility violations', async ({ page }) => {
  await logSet(page, 100, 8);
  const board = await new AxeBuilder({ page }).analyze();
  expect(board.violations.filter(v => v.nodes.some(n => n.target.join(' ').includes('log-')))).toEqual([]);
  await page.click(`#log-${CARD}-0`);
  await expect(page.locator('.editbanner')).toBeVisible();
  const sheet = await new AxeBuilder({ page }).include('.sheet').analyze();
  expect(sheet.violations).toEqual([]);
});
