import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Move to on To get: an item can be bought at another store this month without going to At home, and made that store's for good with one more tap.
// The fixed date is in September 2026 (month 2026-09).
const item = (id, n, store, cents = 300) => ({ id, n, store, qty: 1, cents, every: true, out: false });
const CAT = { stores: ["BJ's", 'Aldi'], items: [item('tp', 'Toilet paper', "BJ's", 2499), item('rice', 'Rice', ''), item('kale', 'Kale', 'Aldi')],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom' }], stores: ["BJ's"] }] };

const seed = async (page, month = { lines: {}, pulled: [] }, admin = false) => {
  await page.evaluate(({ CAT, month, admin }) => {
    if (admin) localStorage.setItem('ironlog:session/admin', 'true');
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(CAT));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify(month));
  }, { CAT, month, admin });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
};
const section = (page, store) => page.locator('section.gstore', { has: page.getByRole('heading', { name: new RegExp(`^${store.replace(/[^\\w ]/g, '.')}( |$)`) }) }).first();
const openPanel = (page, name) => page.getByRole('button', { name: new RegExp(`price of ${name}`, 'i') }).click();

test('an item under Anywhere can be moved to BJ\'s from To get, for this month only, and next month it is back', async ({ page }) => {
  await seed(page);
  await expect(section(page, 'Anywhere').locator('#groc-rice')).toBeVisible();
  await openPanel(page, 'Rice');
  await page.getByLabel('Store for Rice this month').selectOption("BJ's");
  await expect(section(page, "BJ's").locator('#groc-rice')).toBeVisible(); // now under BJ's
  await expect(page.locator('#groc-store-rice')).toBeFocused(); // the select stays where focus was, though the row moved
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/2026-09')).lines.rice)).toEqual({ store: "BJ's" });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/main')).items.find(i => i.id === 'rice').store)).toBe(''); // the item is unchanged
  await page.click('#groc-next');
  await expect(section(page, 'Anywhere').locator('#groc-rice')).toBeVisible(); // another month: back under Anywhere
});

test('Make it the usual store moves the item for good, and the button goes', async ({ page }) => {
  await seed(page);
  await openPanel(page, 'Rice');
  await page.getByLabel('Store for Rice this month').selectOption("BJ's");
  await page.getByRole('button', { name: "Make BJ's the usual store for Rice" }).click();
  await expect(page.getByRole('button', { name: /the usual store for Rice/ })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/main')).items.find(i => i.id === 'rice').store)).toBe("BJ's");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/2026-09') ?? 'null')?.lines?.rice?.store)).toBeUndefined(); // the month is empty again, so it is not kept
  await page.click('#groc-next');
  await expect(section(page, "BJ's").locator('#groc-rice')).toBeVisible(); // still BJ's next month
});

test('a bought item moved to another store counts on that store\'s bill, with its group as the split', async ({ page }) => {
  await seed(page, { lines: { tp: { got: true }, rice: { got: true } }, pulled: [] }, true);
  const card = page.getByRole('region', { name: 'Splitting this month' });
  await expect(card.locator('.gsplitcard', { hasText: "BJ's" }).locator('li', { hasText: 'Bill' }).first()).toContainText('$24.99'); // rice is Anywhere, so not here
  await page.click('#groc-bought summary');
  await openPanel(page, 'Rice');
  await page.getByLabel('Store for Rice this month').selectOption("BJ's");
  await expect(card.locator('.gsplitcard', { hasText: "BJ's" }).locator('li', { hasText: 'Bill' }).first()).toContainText('$27.99'); // 24.99 + 3.00
  await expect(card.locator('.gsplitcard', { hasText: "BJ's" }).locator('li', { hasText: 'Sister owes you' })).toBeVisible(); // shared with BJ's group
});

test('the panel, with Move to and the Make usual button showing, has no accessibility violations', async ({ page }) => {
  await seed(page);
  await openPanel(page, 'Rice');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel('Store for Rice this month').selectOption("BJ's");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); // with the Make usual button showing
});

test('Move to is not offered while there are no stores to move to', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ironlog:grocery/main', JSON.stringify({ stores: [], items: [{ id: 'rice', n: 'Rice', store: '', qty: 1, cents: 300, every: true, out: false }] })));
  await page.reload(); await page.click('#tab-daily'); await page.click('#daily-grocery');
  await openPanel(page, 'Rice');
  await expect(page.getByLabel('Store for Rice this month')).toHaveCount(0);
});
