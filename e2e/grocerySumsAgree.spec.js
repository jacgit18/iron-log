import { test, expect } from './fixtures.js';

// Done-when C4: the money shown in four places for one month tells the same story: the line over the list, the split section's tiles and footer,
// and the line under the store's heading. The fixed date is in September 2026; BJ's is shared and Aldi is solo.
const item = (id, n, store, cents) => ({ id, n, store, qty: 1, cents, every: true, out: false });
const CATALOGUE = {
  stores: ["BJ's", 'Aldi'],
  items: [item('tp', 'Toilet paper', "BJ's", 2499), item('chicken', 'Chicken', "BJ's", 0), item('rice', 'Rice', 'Aldi', 500), item('soap', 'Soap', "BJ's", 400)],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom', covered: true }], stores: ["BJ's"] }],
};
const MONTH = { lines: { tp: { got: true }, chicken: { got: true, prices: [1049, 925, 899], packShares: [{ with: [] }, { with: [] }, null] }, rice: { got: true } }, pulled: [] };
const dollars = s => Math.round(parseFloat(s.replace(/[^0-9.]/g, '')) * 100);

test('the line over the list, the tiles, the footer and the store line agree', async ({ page }) => {
  await page.evaluate(({ CATALOGUE, MONTH }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(MONTH));
  }, { CATALOGUE, MONTH });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  const money = (await page.locator('#groc-money').innerText()).replace(/\s+/g, ' ');
  const m = /Paid \$([\d.]+) · Your share \$([\d.]+) · Owed to you \$([\d.]+)/.exec(money);
  expect(m, money).not.toBeNull();
  const [paid, share, owed] = [m[1], m[2], m[3]].map(dollars);
  await page.getByRole('button', { name: /^Splitting this month/ }).click();
  const split = page.getByRole('region', { name: 'Splitting this month' });
  const tile = async name => dollars(await split.getByText(name, { exact: true }).locator('xpath=following-sibling::dd').innerText());
  expect(await tile('Paid')).toBe(paid);
  expect(await tile('Your share')).toBe(share);
  expect(await tile('Still owed to you')).toBe(owed);
  expect(dollars(await split.locator('.gsplitfoot').innerText())).toBe(owed); // the footer is the outstanding total of the cards
  const line = (await page.locator('.gstoremoney').first().innerText()).replace(/\s+/g, ' ');
  const s = /Bought \$([\d.]+) · Your share \$([\d.]+) · Owed to you \$([\d.]+)/.exec(line);
  expect(s, line).not.toBeNull();
  expect(dollars(s[3])).toBe(owed); // the only shared store carries all of what is owed
  expect(dollars(s[2]) + dollars('5.00')).toBe(share); // BJ's share plus Aldi's $5.00 solo purchase is the month's share
  expect(dollars(s[1]) + dollars('5.00')).toBe(paid);
});
