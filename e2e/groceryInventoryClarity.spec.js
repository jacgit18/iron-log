import { test, expect } from './fixtures.js';

// Inventory says what it is for and what each row means (brief groceries-inventory-vs-shopping): the note and subtitle, a Have or On Shopping pill, Need / Have / All
// chips (shown with one store too), and an Open Inventory button on an empty Shopping month that Back undoes. A unit test cannot catch the wording on the page or Back.
// The fixed date is in September 2026.
const item = (id, n, cents = 300) => ({ id, n, store: 'Aldi', qty: 1, cents, every: true, out: false });
const CATALOGUE = { stores: ['Aldi'], items: [item('eggs', 'Eggs'), item('rice', 'Rice'), item('milk', 'Milk')], groups: [] };
const MONTH = { lines: { eggs: { got: true }, rice: { have: true } }, pulled: [] };
const open = async (page, view, { catalogue = CATALOGUE, month = MONTH } = {}) => {
  await page.evaluate(({ month, catalogue }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(catalogue));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(month));
  }, { month, catalogue });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click(`#groc-view-${view}`);
};
const show = (page, name) => page.getByRole('group', { name: 'Show' }).getByRole('button', { name });
const row = (page, name) => page.locator('li.ghome', { has: page.getByLabel(`Have ${name}`, { exact: true }) });

test('Inventory says ticks carry into next month, and each row says Have or On Shopping', async ({ page }) => {
  await open(page, 'inventory');
  await expect(page.locator('#groc-sub')).toHaveText('Everything you usually buy. Tick what you have; the rest is on Shopping.');
  await expect(page.locator('.gathome .note').first()).toContainText('Ticks carry into next month');
  await expect(page.locator('.gathome')).not.toContainText('every tick clears');
  await expect(row(page, 'Eggs').locator('.ghomestate')).toHaveText('Have');
  await expect(row(page, 'Eggs').locator('.ghomebought')).toHaveText(/^bought [A-Z][a-z]{2}$/);
  await expect(row(page, 'Rice').locator('.ghomebought')).toHaveCount(0);
  await expect(row(page, 'Milk').locator('.ghomestate')).toHaveText('On Shopping');
  await expect(page.locator('section.gstore')).toContainText('1 to buy · 2 you have');
  await page.getByLabel('Have Milk').check();
  await expect(row(page, 'Milk').locator('.ghomestate')).toHaveText('Have');
  await expect(page.locator('section.gstore')).toContainText('0 to buy · 3 you have');
});

test('Need, Have and All filter the rows with one store, start at All, and add no address', async ({ page }) => {
  await open(page, 'inventory');
  await expect(show(page, 'All 3')).toHaveAttribute('aria-pressed', 'true');
  await expect(show(page, 'Need 1')).toBeVisible();
  await expect(show(page, 'Have 2')).toBeVisible();
  const url = page.url();
  await show(page, 'Need 1').click();
  await expect(page.locator('li.ghome')).toHaveCount(1);
  await expect(page.getByLabel('Have Milk')).toBeVisible();
  expect(page.url()).toBe(url);
  await show(page, 'Have 2').click();
  await expect(page.locator('li.ghome')).toHaveCount(2);
  await show(page, 'Need 1').click();
  await page.getByLabel('Have Milk').click(); // you have it now: it leaves Need, and focus goes to Edit (no row is left)
  await expect(page.locator('#groc-edit')).toBeFocused();
  await expect(page.locator('#groc-home-filter-empty')).toHaveText('Nothing to buy. You have everything.');
  await page.click('#groc-edit');
  await expect(page.getByRole('group', { name: 'Show' })).toHaveCount(0); // Edit lists every item
  await page.click('#groc-edit');
  await page.click('#groc-view-shopping'); await page.click('#groc-view-inventory');
  await expect(show(page, /^All/)).toHaveAttribute('aria-pressed', 'true'); // leaving the view resets it
});

test('An empty Shopping month has an Open Inventory button, and Back returns to Shopping', async ({ page }) => {
  await open(page, 'shopping', { catalogue: { stores: [], items: [], groups: [] }, month: { lines: {}, pulled: [] } });
  await expect(page.locator('.gviewsub')).toBeVisible();
  await page.click('#groc-open-inventory');
  await expect(page.locator('#groc-view-inventory')).toHaveAttribute('aria-pressed', 'true');
  expect(page.url()).toContain('/inventory');
  await page.goBack();
  await expect(page.locator('#groc-view-shopping')).toHaveAttribute('aria-pressed', 'true');
});

test('Shopping quick add says one-time and the checkbox says Have', async ({ page }) => {
  await open(page, 'shopping');
  await expect(page.getByRole('button', { name: 'Add one-time item to Aldi' })).toBeVisible();
  await expect(page.getByLabel('Have Milk')).toBeVisible();
  await expect(page.getByLabel('Got Milk')).toHaveCount(0);
});
