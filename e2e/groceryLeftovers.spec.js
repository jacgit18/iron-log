import { test, expect } from './fixtures.js';

// Leftovers from the grocery audits (U-4, U-6, U-7, U-9, X-8, Y-8). The fixed date is in September 2026 (month 2026-09).
const item = (id, n, store = '', cents = 300) => ({ id, n, store, qty: 1, cents, every: true, out: false });
const seed = async (page, cat, months = {}) => {
  await page.evaluate(({ cat, months }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(cat));
    Object.entries(months).forEach(([k, m]) => localStorage.setItem(`ironlog:grocery/${k}`, JSON.stringify(m)));
  }, { cat, months });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
};

test('U-4: the single Price box is off while each one has its own price, so typing cannot wipe the packs', async ({ page }) => {
  await seed(page, { stores: [], items: [item('beef', 'Beef')] }, { '2026-09': { lines: { beef: { prices: [899, 1049] } }, pulled: [] } });
  await page.getByRole('button', { name: 'Count and price of Beef' }).click();
  const price = page.getByLabel('Price each of Beef, dollars');
  await expect(price).toBeDisabled();
  await expect(page.locator('.gmore')).toContainText('Each pack has its own price');
  await expect(page.getByRole('button', { name: /^Remove .* from Beef$/ })).toHaveCount(2);
});

test('U-6: Done keeps text typed in Add an item and says to add or clear it', async ({ page }) => {
  await seed(page, { stores: [], items: [item('rice', 'Rice')] });
  await page.click('#groc-view-home'); await page.click('#groc-edit');
  await page.fill('#groc-name', 'Oat milk');
  await page.click('#groc-done');
  await expect(page.getByRole('region', { name: 'Add an item' })).toBeVisible(); // still editing
  await expect(page.getByRole('alert').filter({ hasText: 'Add or clear this item first.' })).toBeVisible();
  await expect(page.locator('#groc-name')).toHaveValue('Oat milk');
  await page.fill('#groc-name', ''); await page.click('#groc-done'); // cleared: Done finishes
  await expect(page.getByRole('region', { name: 'Add an item' })).toHaveCount(0);
});

test('U-7: focus goes back to the name box after Add, and to the price box after a price chip is removed', async ({ page }) => {
  await seed(page, { stores: [], items: [item('beef', 'Beef')] }, { '2026-09': { lines: { beef: { prices: [899, 1049] } }, pulled: [] } });
  await page.getByRole('button', { name: 'Count and price of Beef' }).click();
  await page.getByRole('button', { name: 'Remove $8.99 from Beef' }).click();
  await expect(page.getByLabel('Add a price for Beef, dollars')).toBeFocused();
  await page.click('#groc-view-home'); await page.click('#groc-edit');
  await page.fill('#groc-name', 'Kale'); await page.click('#groc-add');
  await expect(page.locator('#groc-name')).toHaveValue('');
  await expect(page.locator('#groc-name')).toBeFocused();
});

test('U-9: an item named "Store milk" does not share an element id with Milk’s store select', async ({ page }) => {
  await seed(page, { stores: ['Aldi'], items: [item('milk', 'Milk', 'Aldi')] });
  await page.click('#groc-view-home'); await page.click('#groc-edit');
  await page.fill('#groc-name', 'Store milk'); await page.click('#groc-add');
  await page.fill('#groc-name', 'Prev'); await page.click('#groc-add');
  await page.click('#groc-done'); await page.click('#groc-view-get');
  for (const n of ['Milk', 'Store milk', 'Prev']) await page.getByRole('button', { name: n, exact: true }).click();
  const dupes = await page.evaluate(() => { const seen = new Map(); document.querySelectorAll('[id]').forEach(e => seen.set(e.id, (seen.get(e.id) ?? 0) + 1)); return [...seen].filter(([, n]) => n > 1).map(([id]) => id); });
  expect(dupes).toEqual([]);
});

test('X-8: a store whose only bought item was removed still shows its tax box, and a past month counts that purchase in the store tally', async ({ page }) => {
  const gone = { got: true, qty: 1, cents: 300, store: 'Aldi' };
  await seed(page, { stores: ['Aldi'], items: [item('soap', 'Soap'), item('rice', 'Rice', 'Aldi')] }, {
    '2026-09': { lines: { gone, soap: { got: true } }, pulled: [] }, // Aldi has Rice on the list but gone was bought there
    '2026-08': { lines: { gone, rice: { got: true } }, pulled: [] },
  });
  await expect(page.getByLabel('Tax at Aldi this month')).toBeVisible(); // something was bought at Aldi, even though that item is gone
  await page.click('#groc-prev');
  await expect(page.locator('.gstorehead', { hasText: 'Aldi' }).locator('.gstoremeta .note')).toHaveText('2/2 · $6.00');
});

test('X-8: the tax box shows for a store that has no items left at all', async ({ page }) => {
  await seed(page, { stores: ['Aldi'], items: [item('soap', 'Soap')] }, { '2026-09': { lines: { gone: { got: true, qty: 1, cents: 300, store: 'Aldi' } }, pulled: [] } });
  await expect(page.getByLabel('Tax at Aldi this month')).toBeVisible();
});

test('Y-8: the split header does not say All settled while people still owe each other', async ({ page }) => {
  const cat = { stores: ['BJs'], items: [{ ...item('tp', 'Paper', 'BJs', 2000), share: { with: ['sis', 'mom'], notMine: true } }],
    groups: [{ id: 'g1', n: 'Run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom' }], stores: ['BJs'] }] };
  await seed(page, cat, { '2026-09': { lines: { tp: { got: true } }, pulled: [], payer: { BJs: 'mom' } } });
  const head = page.locator('.gsplittoggle');
  await expect(head).toContainText('Others owe each other $10.00');
  await expect(head).not.toContainText('All settled');
});
