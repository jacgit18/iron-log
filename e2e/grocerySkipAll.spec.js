import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Skip all on To get: every item still to get this month is taken off the list (marked as had until the 1st), after a second tap, with Undo.
// The fixed date is in September 2026, so the month below is 2026-09.
const item = (id, n, store) => ({ id, n, store, qty: 1, cents: 300, every: true, out: false });
const CAT = { stores: ['Aldi'], items: [item('tp', 'Toilet paper', 'Aldi'), item('soap', 'Soap', 'Aldi'), item('rice', 'Rice', ''), item('kale', 'Kale', '')] };
const MONTH = { lines: { tp: { got: true } }, pulled: [] }; // toilet paper bought; soap, rice and kale still to get

const seed = async (page, month = MONTH) => {
  await page.evaluate(({ CAT, month }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(CAT));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(month));
  }, { CAT, month });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
};

test('Skip all takes every unticked item off the list after a second tap, keeps what was bought, and Undo puts them back', async ({ page }) => {
  await seed(page);
  await expect(page.locator('#groc-skipall')).toHaveText('Skip all');
  await page.click('#groc-skipall');
  await expect(page.locator('#groc-skipall')).toHaveText('Tap again to skip 3'); // nothing is skipped by the first tap
  await expect(page.locator('#groc-soap')).toBeVisible();
  await page.click('#groc-skipall');
  await expect(page.locator('#groc-soap')).toHaveCount(0);
  await expect(page.locator('#groc-rice')).toHaveCount(0);
  await expect(page.locator('#groc-kale')).toHaveCount(0);
  await expect(page.locator('#groc-skipall')).toHaveCount(0);
  await expect(page.locator('#groc-summary')).toContainText('Got 1 of 1'); // the bought one is still counted
  await expect(page.locator('.removednote')).toContainText('Removed 3 items from this month’s list.');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused();
  await page.getByRole('button', { name: 'Undo' }).click();
  for (const id of ['soap', 'rice', 'kale']) await expect(page.locator(`#groc-${id}`)).toBeVisible();
  await page.click('#groc-bought summary');
  await expect(page.locator('#groc-tp')).toBeChecked(); // still bought
  await expect(page.locator('#groc-summary')).toContainText('Got 1 of 4');
});

test('skipped items are had at home this month and are back on next month\'s list', async ({ page }) => {
  await seed(page);
  await page.click('#groc-skipall'); await page.click('#groc-skipall');
  await page.click('#groc-view-home');
  for (const n of ['Soap', 'Rice', 'Kale']) await expect(page.getByLabel(`Have ${n}`)).toBeChecked();
  await page.click('#groc-view-get');
  await page.click('#groc-next');
  for (const id of ['soap', 'rice', 'kale']) await expect(page.locator(`#groc-${id}`)).toBeVisible();
  await expect(page.locator('#groc-skipall')).toHaveCount(0); // not offered for a month ahead
});

test('Skip all is not offered when nothing is left to get, and moving away cancels the first tap', async ({ page }) => {
  await seed(page, { lines: { tp: { got: true }, soap: { got: true }, rice: { got: true }, kale: { got: true } }, pulled: [] });
  await expect(page.locator('#groc-skipall')).toHaveCount(0);
  await seed(page);
  await page.click('#groc-skipall');
  await page.click('#groc-summary'); // elsewhere: blur disarms it
  await expect(page.locator('#groc-skipall')).toHaveText('Skip all');
  await expect(page.locator('#groc-soap')).toBeVisible();
});

test('Skip all has no accessibility violations, armed or not', async ({ page }) => {
  await seed(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.click('#groc-skipall');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
