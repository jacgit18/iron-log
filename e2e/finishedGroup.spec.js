import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// A day's done and skipped cards fold into one closed Finished bar (brief finished-group-fold). The row rules are node tests in
// src/lib/finishedGroup.test.ts; this covers the wiring a node test cannot see: the bar, its rows, Edit, Untick and Undo skip, focus, and axe.
const bar = (page, d = 1) => page.locator(`#finished-bar-${d}`);
const row = (page, key) => page.locator(`#finished-list-1 li:has([id="fin-undo-${key}"])`);

async function tickAndSkip(page) {
  await page.locator('#chk-A-d1s1').click(); // ticked: leaves the list of open cards
  await page.locator('#more-A-d1s2').click();
  await page.locator('#skip-A-d1s2').click();
}

test('done and skipped cards leave the list and sit in one closed bar with a count for each', async ({ page }) => {
  await expect(bar(page)).toHaveCount(0);
  await tickAndSkip(page);
  await expect(bar(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(bar(page)).toContainText('Finished (2)');
  await expect(bar(page)).toContainText('1 done');
  await expect(bar(page)).toContainText('1 skipped');
  await expect(page.locator('#chk-A-d1s1')).toHaveCount(0);
  await expect(page.locator('#more-A-d1s2')).toHaveCount(0);
  await expect(page.locator('#finished-list-1')).toHaveCount(0);
  await expect(page.locator('#chk-A-d1s3')).toBeVisible(); // the cards still to do are untouched
});

test('the bar opens and closes, and its rows have Edit and Untick on a done card and Undo skip on a skipped one', async ({ page }) => {
  await tickAndSkip(page);
  await bar(page).click();
  await expect(bar(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#finished-list-1 li')).toHaveCount(2);
  await expect(row(page, 'A-d1s1').getByRole('button', { name: /^Edit / })).toBeVisible();
  await expect(row(page, 'A-d1s1').getByRole('button', { name: /^Untick / })).toBeVisible();
  await expect(row(page, 'A-d1s2').getByRole('button', { name: /^Undo skip for / })).toBeVisible();
  const h = await page.locator('#finished-list-1 li').first().evaluate(el => el.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(44);
  await bar(page).click();
  await expect(page.locator('#finished-list-1')).toHaveCount(0);
});

test('Untick and Undo skip put the cards back as open cards; the bar goes with the last row and focus moves to the day title', async ({ page }) => {
  await tickAndSkip(page);
  await bar(page).click();
  await page.locator('[id="fin-undo-A-d1s1"]').click();
  await expect(page.locator('#chk-A-d1s1')).not.toBeChecked();
  await expect(bar(page)).toContainText('Finished (1)');
  await expect(bar(page)).toBeFocused();
  await page.locator('[id="fin-undo-A-d1s2"]').click();
  await expect(page.locator('#more-A-d1s2')).toBeVisible();
  await expect(bar(page)).toHaveCount(0);
  await expect(page.locator('#colh-1')).toBeFocused();
});

test('Edit on a done row opens the log sheet in Edit mode for that exercise', async ({ page }) => {
  await tickAndSkip(page);
  await bar(page).click();
  await page.locator('[id="fin-log-A-d1s1"]').click();
  await expect(page.locator('.editbanner')).toContainText('Edit mode');
  await expect(page.locator('.editbanner')).toContainText('You are changing the session logged');
});

test('the bar stays closed when the last open card is finished', async ({ page }) => {
  await tickAndSkip(page);
  await bar(page).click();
  await bar(page).click(); // closed again
  await page.locator('#chk-A-d1s3').click();
  await expect(bar(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(bar(page)).toContainText('Finished (3)');
});

test('a superset gives one row per exercise, and Untick puts back only that half', async ({ page }) => {
  await page.locator('#chk-A-d2s5-0').click();
  await page.locator('#chk-A-d2s5-1').click();
  const b = bar(page, 2);
  await expect(b).toBeVisible();
  await b.click();
  await expect(page.locator('[id="fin-undo-A-d2s5#0"]')).toBeVisible();
  await expect(page.locator('[id="fin-undo-A-d2s5#1"]')).toBeVisible();
  await page.locator('[id="fin-undo-A-d2s5#0"]').click();
  await expect(page.locator('#chk-A-d2s5-0')).not.toBeChecked(); // back in the open list
  await expect(page.locator('#chk-A-d2s5-1')).toBeChecked(); // the other half stays ticked
});

test('the open bar and its rows have no accessibility violations', async ({ page }) => {
  await tickAndSkip(page);
  await bar(page).click();
  const results = await new AxeBuilder({ page }).include('#col-1').analyze();
  expect(results.violations).toEqual([]);
});
