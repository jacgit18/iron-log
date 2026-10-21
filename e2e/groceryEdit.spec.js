import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// At home, Edit mode: every item starts closed to one line with an arrow, the name or arrow opens its form (today's fields plus Count and Price),
// and Expand all / Collapse all on a store's heading does it for that store. The fixed date is in September 2026.
const item = (id, n, store, cents, over = {}) => ({ id, n, store, qty: 1, cents, every: true, out: false, ...over });
const CATALOGUE = {
  stores: ["BJ's", 'Aldi'],
  items: [
    item('tp', 'Toilet paper', "BJ's", 2499),
    item('chicken', 'Chicken', "BJ's", 625, { unit: 'lb', qty: 2 }),
    item('rice', 'Rice', "BJ's", 500, { share: { with: ['sis'] } }),
    item('milk', 'Milk', 'Aldi', 399, { note: 'whole' }),
  ],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom' }], stores: ["BJ's"] }],
};
const seed = async page => {
  await page.evaluate(({ CATALOGUE }) => {
    localStorage.setItem('ironlog:session/admin', 'true');
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE));
  }, { CATALOGUE });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-view-home'); await page.click('#groc-edit');
};
const arrow = (page, name) => page.getByRole('button', { name: new RegExp(`^(Expand|Collapse) ${name}$`) });
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/main')).items);

test('Edit starts with every item closed to one line, with its unit and its own split said, and no form fields', async ({ page }) => {
  await seed(page);
  await expect(page.locator('li.gedit.gedshut')).toHaveCount(4);
  await expect(page.locator('li.gedit:not(.gedshut)')).toHaveCount(0);
  await expect(page.getByLabel('Name of Toilet paper')).toHaveCount(0);
  const row = n => page.locator('li.gedit', { has: page.getByLabel(`Have ${n}`, { exact: true }) });
  await expect(row('Chicken').locator('.gchip')).toHaveText('by the lb');
  await expect(row('Rice').locator('.gsplittag')).toHaveText('Me +1');
  await expect(row('Toilet paper').locator('.gsplittag')).toHaveCount(0); // follows the store's group
  await expect(row('Milk')).toContainText('whole');
  await expect(arrow(page, 'Milk')).toHaveAttribute('aria-expanded', 'false');
});

test('the arrow or the name opens one item and leaves the others closed; the arrow closes it again', async ({ page }) => {
  await seed(page);
  await arrow(page, 'Toilet paper').click();
  await expect(page.getByLabel('Name of Toilet paper')).toBeVisible();
  await expect(page.getByLabel('Name of Chicken')).toHaveCount(0);
  await expect(arrow(page, 'Toilet paper')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('li.gedit button.gedname', { hasText: 'Chicken' }).click(); // the name opens it too
  await expect(page.getByLabel('Name of Chicken')).toBeVisible();
  await expect(page.getByLabel('Name of Toilet paper')).toBeVisible(); // each item keeps its own state
  await arrow(page, 'Toilet paper').click();
  await expect(page.getByLabel('Name of Toilet paper')).toHaveCount(0);
});

test('Expand all and Collapse all work on one store at a time, and Done then Edit starts closed again', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: "Expand all in BJ's" }).click();
  await expect(page.locator('li.gedit:not(.gedshut)')).toHaveCount(3);
  await expect(page.getByLabel('Name of Milk')).toHaveCount(0); // Aldi stays closed
  await expect(page.getByRole('button', { name: "Collapse all in BJ's" })).toHaveText('Collapse all');
  await expect(page.getByRole('button', { name: 'Expand all in Aldi' })).toHaveText('Expand all');
  await page.getByRole('button', { name: "Collapse all in BJ's" }).click();
  await expect(page.locator('li.gedit.gedshut')).toHaveCount(4);
  await arrow(page, 'Milk').click();
  await page.click('#groc-done'); await page.click('#groc-edit');
  await expect(page.locator('li.gedit.gedshut')).toHaveCount(4);
});

test('an open item takes a new count and price, says what is wrong with a bad one, and saves nothing for it', async ({ page }) => {
  await seed(page);
  await arrow(page, 'Chicken').click();
  const count = page.getByLabel('Weight (lb) of Chicken'); const price = page.getByLabel('Usual price per lb of Chicken, dollars');
  await expect(count).toHaveValue('2'); await expect(price).toHaveValue('6.25');
  await price.fill('7.10'); await price.blur();
  await count.fill('3'); await count.blur();
  await expect.poll(async () => (await saved(page)).find(i => i.id === 'chicken')).toMatchObject({ qty: 3, cents: 710 });
  await price.fill('3,49'); await price.blur();
  await expect(page.getByRole('alert').filter({ hasText: 'The price must be dollars, like 3.49.' })).toBeVisible();
  await count.fill('0'); await count.blur();
  await expect(page.getByRole('alert').filter({ hasText: 'The count must be a number from 0.01 to 999.' })).toBeVisible();
  expect((await saved(page)).find(i => i.id === 'chicken')).toMatchObject({ qty: 3, cents: 710 });
  await price.fill(''); await price.blur();
  await expect.poll(async () => (await saved(page)).find(i => i.id === 'chicken').cents).toBeNull();
});

test('the tick works closed and open, Adjust shares opens the store’s rows to show the pill, and Remove asks twice and stays closed for Undo', async ({ page }) => {
  await seed(page);
  await page.getByLabel('Have Milk').check(); // closed
  await expect(page.getByLabel('Have Milk')).toBeChecked();
  await expect(page.getByLabel(/Shared with, for Toilet paper/)).toHaveCount(0); // closed rows hold no controls
  await page.getByRole('button', { name: "Adjust shares for BJ's" }).click(); // opens the store's rows, so the pills show
  await expect(page.getByLabel(/Shared with, for Toilet paper/)).toHaveCount(1);
  await expect(page.getByLabel(/Shared with, for Chicken/)).toHaveCount(1);
  await expect(page.getByLabel(/Shared with, for Milk/)).toHaveCount(0); // another store
  const remove = page.getByRole('button', { name: 'Remove Toilet paper from your list' });
  await remove.click();
  await expect(remove).toContainText('Tap again to remove');
  await remove.click();
  await expect(page.getByLabel('Have Toilet paper')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click(); // the item comes back closed, not open
  await expect(page.getByLabel('Have Toilet paper')).toHaveCount(1);
  await expect(page.getByLabel('Name of Toilet paper')).toHaveCount(0);
});

test('the dock keeps its own colours, and the edit screen with rows open has no accessibility violations in both themes', async ({ page }) => {
  await seed(page);
  const dock = await page.locator('.gdock').evaluate(e => { const c = getComputedStyle(e); return { top: c.borderTopWidth, bg: c.backgroundColor, list: getComputedStyle(document.querySelector('li.gedit')).backgroundColor }; });
  expect(dock.top).toBe('3px');
  expect(dock.bg).not.toBe(dock.list);
  await page.getByRole('button', { name: "Expand all in BJ's" }).click();
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  }
});

test('at 320px and 200% text the closed and open rows do not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await seed(page);
  await page.addStyleTag({ content: 'html { font-size: 200% }' });
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(await wide()).toBe(false);
  await page.getByRole('button', { name: "Expand all in BJ's" }).click();
  expect(await wide()).toBe(false);
});
