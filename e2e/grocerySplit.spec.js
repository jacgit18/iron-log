import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// The split card sits folded at the bottom of To get; these specs read it, so each opens it first (a page with no split section has nothing to open).
const openSplit = async page => { const t = page.locator('.gsplittoggle'); if ((await t.count()) && (await t.getAttribute('aria-expanded')) === 'false') await t.click(); };

// Sharing groceries with other people (ADR 059), from the phone's side. Open to everyone: an account that is not an admin sees the grocery
// list exactly as before. The fixed date is in September 2026, so the month below is 2026-09.
const item = (id, n, store, cents) => ({ id, n, store, qty: 1, cents, every: true, out: false });
const CATALOGUE = {
  stores: ["BJ's", 'Aldi'],
  items: [item('tp', 'Toilet paper', "BJ's", 2499), item('chicken', 'Chicken', "BJ's", 0), item('rice', 'Rice', 'Aldi', 500)],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom', covered: true }], stores: ["BJ's"] }],
};
const MONTH = { lines: { tp: { got: true }, chicken: { got: true, prices: [1049, 925, 899], packShares: [{ with: [] }, { with: [] }, null] }, rice: { got: true } }, pulled: [] };

const seed = async (page, { admin = true } = {}) => {
  await page.evaluate(({ admin, CATALOGUE, MONTH }) => {
    if (admin) localStorage.setItem('ironlog:session/admin', 'true');
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(MONTH));
  }, { admin, CATALOGUE, MONTH });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery'); await openSplit(page);
};
const split = page => page.getByRole('region', { name: 'Splitting this month' });

test('an admin sees who owes what, and changing who shares a pack updates it and survives a reload', async ({ page }) => {
  await seed(page);
  await expect(split(page).getByText('Paid').locator('xpath=following-sibling::dd')).toHaveText('$58.72');
  const rows = split(page).locator('.gsplitcard', { hasText: "BJ's" }).locator('.gsplitrows li');
  await expect(rows).toHaveText(['Bill$53.72', 'Your share$31.06', 'Sister owes you$11.33Mark paid', 'Mom, already paidShare already paid$11.33Not paid']); // BJ's: the toilet paper and pack 3 are split three ways, packs 1 and 2 are mine
  // Pack 2 ($9.25) is shared with the sister too: she now owes her half of it as well.
  await page.click('#groc-bought summary');
  await page.getByRole('button', { name: 'Count and price of Chicken' }).click();
  await page.getByLabel('Shared with, for Chicken pack 2: Just me').click();
  await page.locator('details.gshare', { has: page.getByLabel(/for Chicken pack 2/) }).getByLabel('Sister').check();
  await expect(page.getByLabel('Shared with, for Chicken pack 2: Me +1')).toBeVisible();
  await expect(split(page).getByText('Sister owes you').locator('xpath=following-sibling::span')).toHaveText('$15.96');
  await page.reload(); await page.click('#tab-daily'); await page.click('#daily-grocery'); await openSplit(page);
  await expect(split(page).getByText('Sister owes you').locator('xpath=following-sibling::span')).toHaveText('$15.96');
});

test('who paid flips the card: when the mom paid you owe her your share', async ({ page }) => {
  await seed(page);
  await split(page).getByLabel("Who paid at BJ's").selectOption({ label: 'Mom' });
  await expect(split(page).locator('.gsplitcard').getByText('You owe Mom')).toBeVisible(); // the Across all stores block says it too
  await expect(split(page).getByText('Sister owes Mom')).toBeVisible();
  await expect(split(page).getByText('Sister owes you')).toHaveCount(0);
  // What you paid is only the stores you paid for: the mom paid BJ's, so only the Aldi rice was yours.
  await expect(split(page).getByText('Paid', { exact: true }).locator('xpath=following-sibling::dd')).toHaveText('$5.00');
});

test('a store that holds only your own things can still be marked as paid by someone else', async ({ page }) => {
  await seed(page);
  await split(page).getByLabel('Who paid at Aldi').selectOption({ label: 'Mom' });
  await expect(split(page).locator('.gsplitcard', { hasText: 'Aldi' }).getByText('You owe Mom')).toBeVisible();
  await expect(split(page).locator('.gsplitcard', { hasText: 'Aldi' }).locator('li.act')).toContainText('$5.00');
});

test('the Spending view shows your share and says what you paid', async ({ page }) => {
  await seed(page);
  await page.click('#groc-view-spend');
  await expect(page.locator('#groc-spend-share')).toContainText('You paid $58.72');
  await expect(page.locator('#groc-spend-summary')).toContainText('This month $');
});

test('groups are made from the Sharing button on At home, and a store can default to one', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('ironlog:grocery/main')); delete c.groups; localStorage.setItem('ironlog:grocery/main', JSON.stringify(c)); });
  await page.reload(); await page.click('#tab-daily'); await page.click('#daily-grocery'); await openSplit(page);
  await expect(split(page)).toHaveCount(0); // no group yet: nothing is split
  await page.click('#groc-view-home'); await page.click('#groc-sharing');
  await page.getByLabel('New group', { exact: true }).fill('Home');
  await page.getByLabel('People in the new group, separated by commas').fill('Sam, Pat');
  await page.getByRole('button', { name: 'Add group' }).click();
  await page.getByLabel('Sam’s share is already paid').check();
  await page.getByRole('group', { name: 'Stores that split with Home by default' }).getByLabel("BJ's").check();
  await page.click('#groc-sharing'); await page.click('#groc-view-get'); await openSplit(page);
  await expect(split(page)).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/main')).groups[0]);
  expect(saved).toMatchObject({ n: 'Home', stores: ["BJ's"], people: [{ n: 'Sam', covered: true }, { n: 'Pat' }] });
});

test('the split screen has no accessibility violations', async ({ page }) => {
  await seed(page);
  await page.click('#groc-bought summary');
  await page.getByRole('button', { name: 'Count and price of Chicken' }).click();
  await page.getByLabel(/Shared with, for Chicken pack 1/).click();
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
});

test('an account that is not an admin sees the split too', async ({ page }) => {
  await seed(page, { admin: false });
  await expect(page.locator('.gsplit')).toHaveCount(1);
  await page.click('#groc-view-spend');
  await expect(page.locator('#groc-spend-share')).toHaveCount(1);
});
