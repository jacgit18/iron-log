import { test, expect } from './fixtures.js';

// A share set on To get is also the item's usual from this month on (admin-only grocery sharing, ADR 059). A month already bought keeps
// the split it had. The fixed date is in September 2026, so the current month is 2026-09.
const CATALOGUE = {
  stores: ["BJ's"],
  items: [{ id: 'chicken', n: 'Chicken', store: "BJ's", qty: 1, cents: 900, every: true, out: false }],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom' }], stores: ["BJ's"] }],
};
const AUGUST = { lines: { chicken: { got: true } }, pulled: [] };
const stored = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem('ironlog:' + k) || 'null'), key);

test('a share set this month becomes the usual, and last month keeps the split it was bought with', async ({ page }) => {
  await page.evaluate(({ CATALOGUE, AUGUST }) => {
    localStorage.setItem('ironlog:session/admin', 'true');
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE));
    localStorage.setItem('ironlog:grocery/2026-08', JSON.stringify(AUGUST));
  }, { CATALOGUE, AUGUST });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.getByRole('button', { name: 'Chicken', exact: true }).click();
  await page.getByLabel(/Shared with, for Chicken/).click();
  await page.getByLabel('Mom').uncheck();
  await expect(page.getByText('Saved as the usual for next month too.')).toBeVisible();
  await expect.poll(() => stored(page, 'grocery/main').then(g => g.items[0].share)).toEqual({ with: ['sis'] });
  expect((await stored(page, 'grocery/2026-09')).lines.chicken.share).toEqual({ with: ['sis'] });
  expect((await stored(page, 'grocery/2026-08')).lines.chicken.share).toEqual({ with: ['sis', 'mom'] }); // August was bought as the group
});
