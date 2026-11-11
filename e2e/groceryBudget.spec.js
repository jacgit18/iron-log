import { test, expect } from './fixtures.js';

// The monthly grocery budget and the view switch. A unit test cannot see the real box saved into the config and kept across a reload, the bar's width in a real
// layout, or that the Shopping and Bought buttons sit centred with no counts. The fixed date is in September 2026.
const item = (id, n, cents) => ({ id, n, store: 'Aldi', qty: 1, cents, every: true, out: false });
const CATALOGUE = { stores: ['Aldi'], items: [item('rice', 'Rice', 3000), item('apple', 'Apples', 5000)] };
const KEYS = { cat: 'ironlog:grocery/main', month: 'ironlog:grocery/2026-09' };
const seed = async (page, month) => {
  await page.evaluate(({ CATALOGUE, month, KEYS }) => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem(KEYS.cat, JSON.stringify(CATALOGUE));
    localStorage.setItem(KEYS.month, JSON.stringify(month));
  }, { CATALOGUE, month, KEYS });
  await page.reload();
};
const open = async page => { await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-shopping'); };

test('the view buttons carry no counts and sit centred', async ({ page }) => {
  await seed(page, { lines: { rice: { got: true } }, pulled: [] });
  await open(page);
  await expect(page.locator('#groc-view-shopping')).toHaveText('Shopping');
  await expect(page.locator('#groc-view-bought')).toHaveText('Bought');
  const off = await page.locator('.gtop .seg').evaluate(el => { const r = el.getBoundingClientRect(); const p = el.parentElement.getBoundingClientRect(); const b = [...el.children].map(c => c.getBoundingClientRect()); return Math.abs((b[0].left - p.left) - (p.right - b[b.length - 1].right)); });
  expect(off).toBeLessThan(2);
});

test('set a budget, watch the bar, go over it, and it survives a reload', async ({ page }) => {
  await seed(page, { lines: { rice: { got: true } }, pulled: [] }); // Rice 30.00 bought, Apples 50.00 still to get: planned 80.00
  await open(page);
  await page.click('#groc-budget-set');
  await page.fill('#groc-budget-in', 'abc'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#groc-budget-err')).toBeVisible();
  await page.fill('#groc-budget-in', '60'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#groc-budget')).toContainText('$30.00 of $60.00');
  await expect(page.locator('#groc-budget')).toContainText('$30.00 left');
  await expect(page.locator('#groc-budget-note')).toHaveText('You still have $30.00 left in your budget to spend.'); // the whole list (80.00) costs more than 60.00
  await expect(page.locator('#groc-budget .gbstate')).toHaveCount(0); // so the figure shows once, in the note
  await page.reload(); await open(page);
  await expect(page.locator('#groc-budget')).toContainText('$30.00 of $60.00');
  await page.click('#groc-budget-edit'); await page.fill('#groc-budget-in', '100'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#groc-budget-note')).toHaveCount(0); // the list (80.00) fits: no note, and the left figure is back on the line
  await expect(page.locator('#groc-budget .gbstate')).toHaveText('$70.00 left');
  await page.click('#groc-budget-edit'); await page.fill('#groc-budget-in', '25'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#groc-budget')).toContainText('$5.00 over budget');
  await page.click('#groc-budget-edit');
  await page.click('#groc-budget-rm'); await expect(page.locator('#groc-budget-rm')).toHaveText('Tap again to remove'); // the first tap only arms it
  await expect(page.locator('#groc-budget-in')).toBeVisible();
  await page.click('#groc-budget-rm');
  await expect(page.locator('#groc-budget-set')).toBeVisible();
});
