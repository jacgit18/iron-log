import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// "Who owes who" is the first row on Bought: closed each time, its header says what is outstanding. (The money line over the list that used to open it went in brief groceries-bought-inventory-lists.)
// The fixed date is in September 2026. $24.99 of toilet paper at BJ's, split three ways: $8.33 each; Mom is marked Share already paid.
const CATALOGUE = {
  stores: ["BJ's"],
  items: [{ id: 'tp', n: 'Toilet paper', store: "BJ's", qty: 1, cents: 2499, every: true, out: false }],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom', covered: true }], stores: ["BJ's"] }],
};
const MONTH = { lines: { tp: { got: true } }, pulled: [] };
const seed = async page => {
  await page.evaluate(({ CATALOGUE, MONTH }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(MONTH));
  }, { CATALOGUE, MONTH });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-bought'); // the money line and Who owes who live on Bought
};
const toggle = page => page.getByRole('button', { name: /^Who owes who/ });

test('it starts closed, says what is outstanding, and opens and closes in place', async ({ page }) => {
  await seed(page);
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle(page)).toContainText('Outstanding $8.33');
  await expect(page.locator('.gsplitcard')).toHaveCount(0);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.gsplitcard')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Who owes who' })).toBeVisible();
  await toggle(page).click();
  await expect(page.locator('.gsplitcard')).toHaveCount(0);
});

test('there is no money line over the list: the row is the way in, first on the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await seed(page);
  await expect(page.locator('#groc-money')).toHaveCount(0);
  const top = await toggle(page).evaluate(e => Math.round(e.getBoundingClientRect().top));
  expect(top).toBeLessThan(await page.locator('#groc-month').evaluate(e => Math.round(e.getBoundingClientRect().top))); // above the month switcher
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.gsplitcard')).toBeInViewport();
});

test('with nothing bought there is no section, and with no group no money line either', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(({ CATALOGUE }) => { localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE)); }, { CATALOGUE });
  await page.reload(); await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-bought'); // the money line and Who owes who live on Bought
  await expect(toggle(page)).toHaveCount(0);
  await expect(page.locator('#groc-money')).toHaveCount(0);
});

test('closed and open the section has no accessibility violations in both themes, and at 320px and 200% text it does not scroll sideways', async ({ page }) => {
  await seed(page);
  for (const open of [false, true]) {
    if (open) await toggle(page).click();
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme });
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.addStyleTag({ content: 'html { font-size: 200% }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

// Done-when C6 (keyboard): the header is a real button, so Enter and Space open and close it.
test('the header opens and closes with Enter and with Space', async ({ page }) => {
  await seed(page);
  await toggle(page).focus();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  for (const key of ['Enter', 'Space']) {
    await page.keyboard.press(key);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.gsplitcard')).toHaveCount(1);
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press(key);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.gsplitcard')).toHaveCount(0);
  }
});
