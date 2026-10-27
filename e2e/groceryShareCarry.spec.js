import { test, expect } from './fixtures.js';

// A share set on To get is also the item's usual from this month on (admin-only grocery sharing, ADR 059). A month already bought keeps
// the split it had. The fixed date is in September 2026, so the current month is 2026-09.
const CATALOGUE = {
  stores: ["BJ's"],
  items: [{ id: 'chicken', n: 'Chicken', store: "BJ's", qty: 1, cents: 900, every: true, out: false }],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom' }], stores: ["BJ's"] }],
};
const AUGUST = { lines: { chicken: { got: true } }, pulled: [] };
const SEPTEMBER = { lines: {}, pulled: [], carried: '2026-08' }; // already seeded from August and ticks cleared: Chicken is back on To get (ADR 079)
const stored = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem('ironlog:' + k) || 'null'), key);

test('a share set this month becomes the usual, and last month keeps the split it was bought with', async ({ page }) => {
  await page.evaluate(({ CATALOGUE, AUGUST, SEPTEMBER }) => {
    localStorage.setItem('ironlog:session/admin', 'true');
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE));
    localStorage.setItem('ironlog:grocery/2026-08', JSON.stringify(AUGUST));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(SEPTEMBER));
  }, { CATALOGUE, AUGUST, SEPTEMBER });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.getByRole('button', { name: /^Chicken/ }).first().click();
  await page.getByLabel(/Shared with, for Chicken/).click();
  await page.getByLabel('Mom').uncheck();
  await expect(page.getByText('Saved as the usual for next month too.')).toBeVisible();
  await expect.poll(() => stored(page, 'grocery/main').then(g => g.items[0].share)).toEqual({ with: ['sis'] });
  expect((await stored(page, 'grocery/2026-09')).lines.chicken.share).toEqual({ with: ['sis'] });
  expect((await stored(page, 'grocery/2026-08')).lines.chicken.share).toEqual({ with: ['sis', 'mom'] }); // August was bought as the group
});

// Merged from groceryShareHint (audit M-03): a share set from the Ahead view (a month to plan) becomes the item's usual, so it also changes this
// month's items that are not bought yet; the hint says so instead of promising only "next month". Own setup: not admin, no August.
test('this month the hint says the share carries to next month; in a month ahead it says it also changes this month’s unbought items', async ({ page }) => {
  await page.evaluate(({ CATALOGUE }) => { localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE)); }, { CATALOGUE });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.getByRole('button', { name: /^Chicken/ }).first().click();
  await page.getByLabel(/Shared with, for Chicken/).click();
  await page.getByLabel('Mom').uncheck();
  await expect(page.getByText('Saved as the usual for next month too.')).toBeVisible();
  await page.click('#groc-next'); // another month starts with its rows folded (audit N-14)
  await expect(page.getByLabel(/Shared with, for Chicken/)).toHaveCount(0);
  await page.getByRole('button', { name: /^Chicken/ }).first().click();
  await page.getByLabel(/Shared with, for Chicken/).click();
  await page.getByLabel('Sister').uncheck();
  await expect(page.getByText('Saved as the usual from now on: it also changes this month’s items you have not bought yet.')).toBeVisible();
  await expect(page.getByText('Saved as the usual for next month too.')).toHaveCount(0);
});
