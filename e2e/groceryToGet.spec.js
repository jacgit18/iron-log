import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// To get: the count and price pill carries an arrow, the name and the pill and the arrow all open the panel, only the checkbox ticks, and
// Expand all / Collapse all on a store's heading opens or closes that store's rows. The fixed date is in September 2026.
const item = (id, n, store, cents, over = {}) => ({ id, n, store, qty: 1, cents, every: true, out: false, ...over });
const CATALOGUE = {
  stores: ["BJ's", 'Aldi'],
  items: [item('tp', 'Toilet paper', "BJ's", 2499), item('rice', 'Rice', "BJ's", 500), item('milk', 'Milk', 'Aldi', 399), item('eggs', 'Eggs', 'Aldi', 450)],
};
const MONTH = { lines: { eggs: { got: true, qty: 1, cents: 450 } }, pulled: [] };
const seed = async page => {
  await page.evaluate(({ CATALOGUE, MONTH }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(MONTH));
  }, { CATALOGUE, MONTH });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-view-get');
};
const pill = (page, name) => page.getByRole('button', { name: `Count and price of ${name}` });

test('the pill has an arrow, and the arrow, the pill and the name all open and close the panel without ticking', async ({ page }) => {
  await seed(page);
  await expect(pill(page, 'Rice').locator('svg.icon')).toHaveCount(1);
  await expect(pill(page, 'Rice')).toHaveAttribute('aria-expanded', 'false');
  await pill(page, 'Rice').click();
  await expect(pill(page, 'Rice')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Count of Rice')).toBeVisible();
  await page.locator('button.gnamebtn', { hasText: 'Rice' }).click(); // the name closes it
  await expect(page.getByLabel('Count of Rice')).toHaveCount(0);
  await expect(page.locator('#groc-rice')).not.toBeChecked();
});

test('Expand all and Collapse all work on one store, and the Bought fold has neither', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: "Expand all in BJ's" }).click();
  await expect(page.getByLabel('Count of Toilet paper')).toBeVisible();
  await expect(page.getByLabel('Count of Rice')).toBeVisible();
  await expect(page.getByLabel('Count of Milk')).toHaveCount(0); // Aldi is its own store
  await expect(page.getByRole('button', { name: "Collapse all in BJ's" })).toHaveText('Collapse all');
  await page.getByRole('button', { name: 'Expand all in Aldi' }).click();
  await expect(page.getByLabel('Count of Milk')).toBeVisible();
  await page.getByRole('button', { name: "Collapse all in BJ's" }).click();
  await expect(page.getByLabel('Count of Rice')).toHaveCount(0);
  await expect(page.getByLabel('Count of Milk')).toBeVisible(); // Aldi still open
  await page.click('#groc-bought summary');
  await expect(page.locator('#groc-bought').getByRole('button', { name: /Expand all|Collapse all/ })).toHaveCount(0);
});

test('opening one row makes the store button Collapse all only once every row is open', async ({ page }) => {
  await seed(page);
  await pill(page, 'Rice').click();
  await expect(page.getByRole('button', { name: "Expand all in BJ's" })).toBeVisible();
  await pill(page, 'Toilet paper').click();
  await expect(page.getByRole('button', { name: "Collapse all in BJ's" })).toBeVisible();
});

test('a refused count or price says why, and "I have this" takes the item off the list', async ({ page }) => {
  await seed(page);
  await pill(page, 'Milk').click();
  await page.getByLabel('Count of Milk').fill('abc'); await page.getByLabel('Count of Milk').blur();
  await expect(page.getByRole('alert').filter({ hasText: 'The count must be a number from 0.01 to 999.' })).toBeVisible();
  await page.getByLabel('Price each of Milk, dollars').fill('3,49'); await page.getByLabel('Price each of Milk, dollars').blur();
  await expect(page.getByRole('alert').filter({ hasText: 'The price must be dollars, like 3.49.' })).toBeVisible();
  await page.getByRole('button', { name: 'I have this: Milk' }).click();
  await expect(pill(page, 'Milk')).toHaveCount(0);
  await expect(page.getByLabel('Have Milk')).toHaveCount(0);
});

test('with every row open the page has no accessibility violations in both themes, and at 320px and 200% text it does not scroll sideways', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: "Expand all in BJ's" }).click();
  await page.getByRole('button', { name: 'Expand all in Aldi' }).click();
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.addStyleTag({ content: 'html { font-size: 200% }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
