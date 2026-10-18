import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const open = async page => { await page.click('#tab-daily'); await page.click('#daily-grocery'); };
const add = async (page, n, price) => {
  await page.fill('#groc-name', n);
  if (price) { await page.click('#groc-more'); await page.fill('#groc-price', price); await page.click('#groc-more'); }
  await page.click('#groc-add');
};

test('To get shows a bar of how much is bought, and items with no price are marked and counted', async ({ page }) => {
  await open(page);
  await page.click('#groc-edit');
  await add(page, 'Eggs', '3.50'); await add(page, 'Rice');
  await page.click('#groc-done');
  await page.click('#groc-view-get');
  const fill = page.locator('.gprog > span');
  await expect(fill).toHaveCSS('width', '0px');
  await expect(page.locator('#groc-summary .gwarn')).toHaveText('1 without a price');
  await expect(page.getByRole('button', { name: 'Count and price of Rice' }).locator('.gpill')).toHaveClass(/noprice/);
  await expect(page.getByRole('button', { name: 'Count and price of Eggs' }).locator('.gpill')).not.toHaveClass(/noprice/);
  await page.locator('#groc-eggs').check();
  await expect.poll(async () => fill.evaluate(el => Math.round(100 * el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width))).toBe(50);
  await expect(page.locator('#groc-summary')).toContainText('Got 1 of 2 · Spent $3.50 · Expected $3.50 · 1 without a price');
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  }
});
