import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// "Splitting this month" is folded at the bottom of To get: closed each time, its header says what is outstanding, and the money line over the list opens it.
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
  await page.click('#tab-daily'); await page.click('#daily-grocery');
};
const toggle = page => page.getByRole('button', { name: /^Splitting this month/ });

test('it starts closed, says what is outstanding, and opens and closes in place', async ({ page }) => {
  await seed(page);
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle(page)).toContainText('Outstanding $8.33');
  await expect(page.locator('.gsplitcard')).toHaveCount(0);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.gsplitcard')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Splitting this month' })).toBeVisible();
  await toggle(page).click();
  await expect(page.locator('.gsplitcard')).toHaveCount(0);
});

test('the money line over the list opens it and brings it into view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await seed(page);
  await page.click('#groc-bought summary'); // a longer page, so the section starts below the first screen
  await page.locator('#groc-money').click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.gsplitcard')).toBeInViewport();
});

test('with nothing bought there is no section, and with no group no money line either', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(({ CATALOGUE }) => { localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE)); }, { CATALOGUE });
  await page.reload(); await page.click('#tab-daily'); await page.click('#daily-grocery');
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
