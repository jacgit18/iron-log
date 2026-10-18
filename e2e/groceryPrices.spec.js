import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const open = async page => { await page.click('#tab-daily'); await page.click('#daily-grocery'); };
const addBeef = async (page, price) => {
  await page.click('#groc-edit');
  await page.fill('#groc-name', 'Beef');
  if (price) { await page.click('#groc-more'); await page.fill('#groc-price', price); }
  await page.click('#groc-add');
  await page.click('#groc-done');
  await page.click('#groc-view-get');
  await page.getByRole('button', { name: 'Count and price of Beef' }).click();
};
const addPrice = async (page, text) => { await page.getByLabel('Add a price for Beef, dollars').fill(text); await page.getByRole('button', { name: 'Add price' }).click(); };

test('prices are added one at a time or together as chips, totalled, kept after a tick and a reload, and a chip can be removed', async ({ page }) => {
  await open(page);
  await addBeef(page);
  await addPrice(page, '8.99'); await addPrice(page, '10.49 9.25');
  await expect(page.getByRole('button', { name: /^Remove .* from Beef$/ })).toHaveCount(3);
  await expect(page.getByLabel('Total for Beef')).toHaveText('$28.73');
  await expect(page.getByRole('button', { name: 'Count and price of Beef' })).toHaveText('3 × avg $9.58');
  await expect(page.getByLabel('Count of Beef')).toHaveValue('3');
  await expect(page.locator('#groc-summary')).toContainText('Expected $28.73');
  await page.locator('#groc-beef').check(); // bought: the prices stay
  await expect(page.locator('#groc-alldone')).toBeVisible();
  await page.click('#groc-bought summary');
  await expect(page.getByLabel('Total for Beef')).toHaveText('$28.73');
  await page.reload(); await open(page); await page.click('#groc-view-get');
  await page.click('#groc-bought summary');
  await page.getByRole('button', { name: 'Count and price of Beef' }).click();
  await page.getByRole('button', { name: 'Remove $10.49 from Beef' }).click();
  await expect(page.getByLabel('Total for Beef')).toHaveText('$18.24');
  await expect(page.getByRole('button', { name: 'Count and price of Beef' })).toHaveText('2 × avg $9.12');
  await page.getByRole('button', { name: 'Remove $8.99 from Beef' }).click(); await page.getByRole('button', { name: 'Remove $9.25 from Beef' }).click();
  await expect(page.getByRole('button', { name: 'Count and price of Beef' })).not.toContainText('avg'); // the last chip gone: back to one count and price
});

test('a typed count goes back to one price, and something that is not a price is refused', async ({ page }) => {
  await open(page);
  await addBeef(page);
  await addPrice(page, '8.99, abc');
  await expect(page.getByRole('alert').filter({ hasText: 'Prices are dollars' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Count and price of Beef' })).toHaveText('1 × no price');
  await addPrice(page, '8.99 10.49');
  await page.getByLabel('Count of Beef').fill('3'); await page.getByLabel('Count of Beef').blur();
  await expect(page.getByRole('button', { name: /^Remove .* from Beef$/ })).toHaveCount(0);
});

test('the single price box is empty while each one has its own price, so the catalogue price is not mistaken for it', async ({ page }) => {
  await open(page);
  await addBeef(page, '9');
  await expect(page.getByLabel('Price each of Beef, dollars')).toHaveValue('9.00');
  await addPrice(page, '8.99 10.49');
  await expect(page.getByLabel('Price each of Beef, dollars')).toHaveValue('');
  await expect(page.getByLabel('Total for Beef')).toHaveText('$19.48');
});

test('At home shows what was bought, To get explains the fold, and Edit mode is marked, with no accessibility violations in both themes', async ({ page }) => {
  await open(page);
  await addBeef(page);
  await page.locator('#groc-beef').check();
  await page.click('#groc-bought summary');
  await expect(page.locator('#groc-bought')).toContainText('ticked Have on At home');
  await page.click('#groc-view-home');
  await expect(page.locator('.ghome .gchip')).toHaveText('Bought');
  await page.click('#groc-edit');
  await expect(page.locator('.geditbadge')).toHaveText('Editing');
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  }
});

test('a price typed but not added is saved when the box loses focus', async ({ page }) => {
  await open(page);
  await addBeef(page);
  await page.getByLabel('Add a price for Beef, dollars').fill('8.99');
  await page.getByLabel('Count of Beef').focus(); // leave the box without pressing Add
  await expect(page.getByRole('button', { name: 'Remove $8.99 from Beef' })).toBeVisible();
  await expect(page.getByLabel('Total for Beef')).toHaveText('$8.99');
});
