import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// The split card may sit folded at the bottom of To get (a separate change); open it when it does, so this spec reads the card either way.
const openSplit = async page => { const t = page.locator('.gsplittoggle'); if ((await t.count()) && (await t.getAttribute('aria-expanded')) === 'false') await t.click(); };

// The split card's settled marks (ADR 062): every owed row can be marked paid (or sent) once the money has moved outside the app; amounts never change.
// The fixed date is in September 2026, so the month below is 2026-09. $24.99 of toilet paper at BJ's, split three ways: $8.33 each (your share is $8.33 too).
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
  await page.click('#tab-daily'); await page.click('#daily-grocery'); await openSplit(page);
};
const split = page => page.getByRole('region', { name: 'Splitting this month' });
const tile = (page, name) => split(page).getByText(name, { exact: true }).locator('xpath=following-sibling::dd');
const row = (page, text) => split(page).locator('.gsplitrows li', { hasText: text });
const btn = (page, name) => split(page).getByRole('button', { name: new RegExp(`^${name}:`) });

test('a person marked Share already paid starts as paid, the rest as owing, and the card says what is outstanding', async ({ page }) => {
  await seed(page);
  await expect(row(page, 'Sister owes you')).toContainText('$8.33');
  await expect(row(page, 'Mom, already paid')).toContainText('Share already paid');
  await expect(tile(page, 'Still owed to you')).toHaveText('$8.33');
  await expect(split(page).locator('.gsplitfoot')).toHaveText('Outstanding $8.33');
});

test('Mark paid settles a row without changing its amount, Undo takes it back, and the mark survives a reload', async ({ page }) => {
  await seed(page);
  await btn(page, 'Mark paid').click();
  await expect(row(page, 'Sister paid you')).toContainText('$8.33');
  await expect(tile(page, 'Still owed to you')).toHaveText('$0.00');
  await expect(split(page).locator('.gsplitfoot')).toHaveText('All settled');
  await expect(tile(page, 'Your share')).toHaveText('$8.33'); // untouched
  await page.reload(); await page.click('#tab-daily'); await page.click('#daily-grocery'); await openSplit(page);
  await expect(row(page, 'Sister paid you')).toBeVisible();
  await btn(page, 'Undo').click();
  await expect(row(page, 'Sister owes you')).toBeVisible();
  await expect(tile(page, 'Still owed to you')).toHaveText('$8.33');
});

test('Not paid overrides Share already paid for this month, and marking it paid again simply drops the override', async ({ page }) => {
  await seed(page);
  await btn(page, 'Not paid').click();
  await expect(row(page, 'Mom owes you')).toContainText('$8.33');
  await expect(tile(page, 'Still owed to you')).toHaveText('$16.66');
  await btn(page, 'Mark paid').first().click(); // Sister
  await row(page, 'Mom owes you').getByRole('button', { name: /^Mark paid:/ }).click();
  await expect(row(page, 'Mom, already paid')).toBeVisible(); // the same as her default, so the override is simply gone
});

test('when Mom paid, you can mark yours as sent, a row between others can be marked, and changing who paid starts the marks over', async ({ page }) => {
  await seed(page);
  await split(page).getByLabel("Who paid at BJ's").selectOption('mom');
  await expect(row(page, 'You owe Mom')).toContainText('$8.33');
  await expect(tile(page, 'You still owe')).toHaveText('$8.33');
  await expect(row(page, 'Sister owes Mom')).toContainText('$8.33');
  await btn(page, 'Mark as sent').click();
  await expect(row(page, 'You sent Mom')).toBeVisible();
  await expect(split(page).getByText('You still owe', { exact: true })).toHaveCount(0);
  await split(page).getByLabel("Who paid at BJ's").selectOption('me');
  await expect(row(page, 'Sister owes you')).toBeVisible();
  await split(page).getByLabel("Who paid at BJ's").selectOption('mom');
  await expect(row(page, 'You owe Mom')).toBeVisible(); // not "You sent": the marks started over
});

test('the card with marks has no accessibility violations in both themes, and at 320px and 200% text it does not scroll sideways', async ({ page }) => {
  await seed(page);
  await btn(page, 'Mark paid').click();
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.addStyleTag({ content: 'html { font-size: 200% }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('the line under the store says what is still owed, and Settled once every row is marked', async ({ page }) => {
  await seed(page);
  await page.click('#groc-bought summary');
  const line = page.locator('.gstoremoney');
  await expect(line).toHaveText('Bought $24.99 · Your share $8.33 · Owed to you $8.33');
  await btn(page, 'Mark paid').click();
  await expect(line).toHaveText('Bought $24.99 · Your share $8.33 · Settled ✓');
});
