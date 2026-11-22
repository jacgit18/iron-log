import { test, expect } from './fixtures.js';
import { startFood } from './recipesNav.js';

// Whole pack (brief whole-pack). The pack-size rules and the stepper top are node tests (readyMade.test.ts, dietLog.test.ts, labelFill.test.ts); this covers the
// wiring a unit test cannot: the Servings per pack box saving and coming back, the detail line, Whole pack setting the stepper past 10, and a food with no pack size
// keeping the old top of 10. The portion stepper and Whole pack are in the portion sheet now (the recipe page's Plan… opens it on tomorrow, where nothing is logged; the Day field set to today logs).
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const TODAY = '2026-09-24'; // the fixed clock in fixtures.js
const openSheetForToday = async page => { await page.getByRole('button', { name: 'Plan…' }).click(); const dlg = page.getByRole('dialog'); await dlg.getByLabel('Day').fill(TODAY); return dlg; };
const make = async (page, name, pack) => {
  await openRecipes(page);
  await startFood(page);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Calories per serving').fill('210');
  await page.getByLabel('Protein per serving (g)').fill('6');
  if (pack !== undefined) await page.getByLabel('Servings per pack, optional').fill(pack);
  await page.getByRole('button', { name: 'Save food' }).click();
};

test('a 12-serving pack: the detail says so, Whole pack sets 12 portions, More stops there, and the log control logs the pack', async ({ page }) => {
  await make(page, 'Gnocchi', '12');
  await expect(page.getByText('12 servings per pack')).toBeVisible();
  const dlg = await openSheetForToday(page);
  const portions = dlg.getByRole('status').filter({ hasText: /^[\d.]+ portions?$/ });
  await expect(portions).toHaveText('1 portion');
  await dlg.getByRole('button', { name: 'Whole pack (12)' }).click();
  await expect(portions).toHaveText('12 portions');
  await expect(dlg.getByRole('button', { name: 'More', exact: true })).toBeDisabled();
  await expect(dlg.getByRole('button', { name: 'Whole pack (12)' })).toBeDisabled();
  await dlg.getByRole('button', { name: 'Less' }).click();
  await expect(portions).toHaveText('11.5 portions');
  await dlg.getByRole('button', { name: 'Whole pack (12)' }).click();
  await dlg.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(dlg.getByText(/Logged .+: 12 portions to today\./)).toBeVisible();
  await dlg.getByRole('status').filter({ hasText: /Logged .+: 12 portions/ }).getByRole('button', { name: 'Undo' }).click(); // the entry's Undo (a logged 12 also saves the usual, whose notice has its own Undo)
  await expect(dlg.getByText(/Logged .+: 12 portions/)).toHaveCount(0);
  await expect(dlg.getByText(/Usual portion saved/)).toHaveCount(0); // the entry's Undo takes the usual back too
});

test('the box saves, comes back on edit, and a wrong number is refused', async ({ page }) => {
  await make(page, 'Gnocchi', '2.5');
  await expect(page.getByRole('alert')).toHaveText('Servings per pack must be a whole number from 1 to 99.');
  await page.getByLabel('Servings per pack, optional').fill('8');
  await page.getByRole('button', { name: 'Save food' }).click();
  await expect(page.getByText('8 servings per pack')).toBeVisible();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: /Edit/ }).first().click();
  await expect(page.getByLabel('Servings per pack, optional')).toHaveValue('8');
  await page.getByLabel('Servings per pack, optional').fill('');
  await page.getByRole('button', { name: 'Save food' }).click();
  await expect(page.getByText(/servings per pack/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Whole pack/ })).toHaveCount(0);
});

test('a food with no pack size has no Whole pack button and the stepper stops at 10', async ({ page }) => {
  await make(page, 'Lasagna');
  const dlg = await openSheetForToday(page);
  await expect(dlg.getByRole('button', { name: /Whole pack/ })).toHaveCount(0);
  const more = dlg.getByRole('button', { name: 'More', exact: true });
  for (let i = 0; i < 18; i++) await more.click();
  await expect(dlg.getByRole('status').filter({ hasText: /^[\d.]+ portions$/ })).toHaveText('10 portions');
  await expect(more).toBeDisabled();
});

// The recipe page's Whole pack (N) button beside Log (brief whole-pack-button-and-log-leftovers, preview option B). Which foods get it is a node test (recipeSummary.test.ts); this covers the tap, the status line, Undo, the usual portion and the layout.
test('the food page has Whole pack (12): one tap logs 12 for today, both buttons become Added, Undo takes the entry and the usual back', async ({ page }) => {
  await make(page, 'Gnocchi', '12');
  const pack = page.getByRole('button', { name: 'Whole pack (12)' });
  await expect(pack).toBeVisible();
  expect((await pack.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await pack.click();
  const line = page.getByRole('status').filter({ hasText: /Logged Gnocchi, 12 portions, for today\./ });
  await expect(line).toBeVisible();
  await expect(line).toContainText('Usual portion saved: 12 portions.'); // the same rule as the portion sheet's Log
  await expect(page.getByRole('button', { name: 'Added', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Log', exact: true })).toHaveCount(0);
  await expect(pack).toHaveCount(0);
  await expect(page.locator('.rc-strip')).toContainText('Usual 12 portions');
  await line.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Log', exact: true })).toBeVisible();
  await expect(pack).toBeVisible();
  await expect(page.locator('.rc-strip')).not.toContainText('Usual 12 portions'); // Undo took the usual back too
  await page.getByRole('button', { name: 'Log', exact: true }).click(); // Log first: the pack button goes too
  await expect(page.getByRole('button', { name: 'Added', exact: true })).toBeDisabled();
  await expect(pack).toHaveCount(0);
});

test('the food page has no Whole pack button without a pack size', async ({ page }) => {
  await make(page, 'Lasagna');
  await expect(page.getByRole('button', { name: 'Log', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Whole pack/ })).toHaveCount(0);
});

test('the action row wraps at 320 px with no sideways scroll', async ({ page }) => {
  await make(page, 'Gnocchi', '12');
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.getByRole('button', { name: 'Whole pack (12)' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
