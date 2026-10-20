import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Ticking on To get is hard to do by accident: only the checkbox ticks (the name opens the count, price and Move to panel), and a tick can be
// taken back from a notice. A moved item says where it usually is. The fixed date is in September 2026 (month 2026-09).
const item = (id, n, store) => ({ id, n, store, qty: 1, cents: 300, every: true, out: false });
const CAT = { stores: ['Aldi', "BJ's"], items: [item('rice', 'Rice', 'Aldi'), item('kale', 'Kale', 'Aldi'), item('soap', 'Soap', "BJ's")] };
const seed = async (page, month = { lines: {}, pulled: [] }) => {
  await page.evaluate(({ CAT, month }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(CAT));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(month));
  }, { CAT, month });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
};

test('tapping the name or the price opens the panel and ticks nothing; only the checkbox ticks', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Rice', exact: true }).click();
  await expect(page.getByLabel('Count of Rice')).toBeVisible();
  await expect(page.locator('#groc-rice')).not.toBeChecked();
  await page.getByRole('button', { name: 'Rice', exact: true }).click(); // the same tap closes it
  await expect(page.getByLabel('Count of Rice')).toHaveCount(0);
  await page.getByRole('button', { name: /price of Kale/i }).click();
  await expect(page.locator('#groc-kale')).not.toBeChecked();
  await expect(page.locator('#groc-summary')).toContainText('Got 0 of 3');
  await page.locator('#groc-soap').check();
  await expect(page.locator('#groc-summary')).toContainText('Got 1 of 3');
});

test('ticking shows a Bought notice with Undo that puts the item back, and the checkbox gets focus again', async ({ page }) => {
  await seed(page);
  await page.locator('#groc-rice').check();
  await expect(page.locator('#groc-rice')).toBeHidden(); // bought: it leaves the list
  await expect(page.locator('.gtickednote')).toContainText('Bought Rice.');
  await page.locator('.gtickednote').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.gtickednote')).toHaveCount(0);
  await expect(page.locator('#groc-rice')).toBeVisible();
  await expect(page.locator('#groc-rice')).not.toBeChecked();
  await expect(page.locator('#groc-rice')).toBeFocused();
  await expect(page.locator('#groc-summary')).toContainText('Got 0 of 3');
});

test('a later tick replaces the notice, Dismiss closes it, and another month does not show it', async ({ page }) => {
  await seed(page);
  await page.locator('#groc-rice').check();
  await page.locator('#groc-kale').check();
  await expect(page.locator('.gtickednote')).toContainText('Bought Kale.'); // only the last one
  await page.locator('.gtickednote').getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('.gtickednote')).toHaveCount(0);
  await page.locator('#groc-soap').check();
  await expect(page.locator('.gtickednote')).toContainText('Bought Soap.');
  await page.click('#groc-next');
  await expect(page.locator('.gtickednote')).toHaveCount(0);
});

test('unticking from the Bought fold shows no Bought notice', async ({ page }) => {
  await seed(page, { lines: { rice: { got: true } }, pulled: [] });
  await page.click('#groc-bought summary');
  await page.locator('#groc-rice').uncheck();
  await expect(page.locator('.gtickednote')).toHaveCount(0);
});

test('an item moved to another store says where it usually is', async ({ page }) => {
  await seed(page, { lines: { rice: { store: "BJ's" } }, pulled: [] });
  const bjs = page.locator('section.gstore', { has: page.getByRole('heading', { name: "BJ's", exact: true }) });
  await expect(bjs.getByRole('button', { name: /^Rice/ })).toContainText('Usually Aldi');
  await expect(bjs.getByRole('button', { name: /^Soap/ })).not.toContainText('Usually');
});

test('the row, the notice and the panel have no accessibility violations', async ({ page }) => {
  await seed(page, { lines: { rice: { store: "BJ's" } }, pulled: [] });
  await page.getByRole('button', { name: /^Rice/ }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.locator('#groc-soap').check();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
