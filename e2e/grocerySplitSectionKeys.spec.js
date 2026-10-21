import { test, expect } from './fixtures.js';

// Done-when C6 (keyboard): the "Splitting this month" header is a real button, so Enter and Space open and close it. The fixed date is in September 2026.
const CATALOGUE = {
  stores: ["BJ's"],
  items: [{ id: 'tp', n: 'Toilet paper', store: "BJ's", qty: 1, cents: 2499, every: true, out: false }],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom', covered: true }], stores: ["BJ's"] }],
};
const MONTH = { lines: { tp: { got: true } }, pulled: [] };
const toggle = page => page.getByRole('button', { name: /^Splitting this month/ });

test('the header opens and closes with Enter and with Space', async ({ page }) => {
  await page.evaluate(({ CATALOGUE, MONTH }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(MONTH));
  }, { CATALOGUE, MONTH });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
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
