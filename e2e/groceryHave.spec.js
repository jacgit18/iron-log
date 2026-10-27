import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const open = async page => { await page.click('#tab-daily'); await page.click('#daily-grocery'); };
const add = async (page, n) => {
  await page.fill('#groc-name', n);
  await page.click('#groc-add');
  await expect(page.locator('#groc-name')).toHaveValue('');
};
const setup = async page => {
  await open(page);
  await page.click('#groc-edit');
  await add(page, 'Rice');
  await add(page, 'Kale');
  await page.click('#groc-done');
};

test('ticking a row on To get keeps keyboard focus in the list: the next row, the one before, then the Bought line', async ({ page }) => {
  await open(page);
  await page.click('#groc-edit');
  await add(page, 'Rice'); await add(page, 'Kale'); await add(page, 'Salt');
  await page.click('#groc-done');
  await page.click('#groc-view-get');
  await page.locator('#groc-kale').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#groc-rice')).toBeFocused(); // the next row (new items go on top: Salt, Kale, Rice)
  await page.keyboard.press('Space');
  await expect(page.locator('#groc-salt')).toBeFocused(); // nothing after it: the one before
  await page.keyboard.press('Space');
  await expect(page.locator('#groc-bought-sum')).toBeFocused(); // nothing left to get
  await page.keyboard.press('Enter'); // open the fold, then untick: focus follows the row back into the list
  await page.locator('#groc-kale').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#groc-kale')).toBeFocused();
});

test('the Bought this month fold has no accessibility violations, open, in the light and dark themes', async ({ page }) => {
  await setup(page);
  await page.click('#groc-view-get');
  await page.locator('#groc-kale').check();
  await page.click('#groc-bought summary');
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  }
});

test('ticking a row with its count and price panel open keeps the panel open, in the fold, to finish the price', async ({ page }) => {
  await open(page);
  await page.click('#groc-edit');
  await page.fill('#groc-name', 'Kale'); await page.click('#groc-more'); await page.fill('#groc-qty', '2'); await page.fill('#groc-price', '2.50'); await page.click('#groc-add');
  await add(page, 'Rice');
  await page.click('#groc-done');
  await page.click('#groc-view-get');
  const pill = page.getByRole('button', { name: 'Count and price of Kale' });
  await pill.click();
  await expect(pill).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#groc-kale').check(); // bought: the row moves to the fold, and the panel stays open
  await expect(page.locator('#groc-bought')).toHaveAttribute('open', '');
  await expect(pill).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#groc-kale')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Count and price of Rice' })).toHaveAttribute('aria-expanded', 'false'); // a panel that was shut is still shut
  await page.getByLabel('Price each of Kale, dollars').fill('3.10'); await page.getByLabel('Price each of Kale, dollars').blur();
  await expect(page.getByLabel('Total for Kale')).toHaveText('$6.20');
  await expect(page.locator('#groc-summary')).toContainText('Spent $6.20');
  await page.locator('#groc-kale').uncheck(); // back in the list, still open
  await expect(page.locator('#groc-bought')).toHaveCount(0);
  await expect(pill).toHaveAttribute('aria-expanded', 'true');
});

test('the fold starts folded again after it has been emptied', async ({ page }) => {
  await setup(page);
  await page.click('#groc-view-get');
  await page.locator('#groc-kale').check();
  await page.click('#groc-bought summary');
  await page.locator('#groc-kale').uncheck(); // the fold is gone
  await page.locator('#groc-rice').check();
  await expect(page.locator('#groc-bought')).not.toHaveAttribute('open', '');
});
