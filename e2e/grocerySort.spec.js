import { test, expect } from './fixtures.js';

// Grocery sort and search. A unit test cannot see the real select, the choice in localStorage across a real reload, storage that
// throws, keyboard focus after a tick in a re-sorted list, or that the stored list is the same afterwards. The fixed date is in September 2026.
const item = (id, n, store, cents, over = {}) => ({ id, n, store, qty: 1, cents, every: true, out: false, ...over });
const CATALOGUE = {
  stores: ['Aldi'],
  items: [item('rice', 'Rice', 'Aldi', 300), item('apple', 'Apples', 'Aldi', 500), item('bread', 'Bread', 'Aldi', null), item('arbol', 'Árbol chili', 'Aldi', 500, { qty: 2 }), item('eggs', 'Eggs', 'Aldi', 100)],
};
const MONTH = { lines: { rice: { have: true } }, pulled: [] };
const KEYS = { cat: 'ironlog:grocery/main', month: 'ironlog:grocery/2026-09' };
const seed = async page => {
  await page.evaluate(({ CATALOGUE, MONTH, KEYS }) => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem(KEYS.cat, JSON.stringify(CATALOGUE));
    localStorage.setItem(KEYS.month, JSON.stringify(MONTH));
  }, { CATALOGUE, MONTH, KEYS });
  await page.reload();
};
const open = async (page, view) => { await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click(`#groc-view-${view}`); };
const rowNames = (page, sel) => page.locator(`${sel} .gtickname`).evaluateAll(els => els.map(e => e.firstChild.textContent));
const sortBox = page => page.getByRole('combobox', { name: 'Sort' });

test('At home: each option reorders, the choice survives a reload, and the stored list is untouched', async ({ page }) => {
  await seed(page);
  await open(page, 'home');
  expect(await rowNames(page, '.ghome')).toEqual(['Apples', 'Árbol chili', 'Bread', 'Eggs', 'Rice']);
  const stored = await page.evaluate(k => localStorage.getItem(k), KEYS.cat);

  await sortBox(page).selectOption('price');
  expect(await rowNames(page, '.ghome')).toEqual(['Árbol chili', 'Apples', 'Rice', 'Eggs', 'Bread']); // Árbol 2 x 5.00 = 10.00 first, then Apples 5.00, Rice 3.00, Eggs 1.00, unpriced Bread last
  await sortBox(page).selectOption('open');
  expect(await rowNames(page, '.ghome')).toEqual(['Apples', 'Árbol chili', 'Bread', 'Eggs', 'Rice']); // Rice is ticked (have), so it goes last

  await page.reload();
  await open(page, 'home');
  await expect(sortBox(page)).toHaveValue('open');
  expect(await page.evaluate(k => localStorage.getItem(k), KEYS.cat)).toBe(stored); // sorting wrote nothing
  await expect(page.locator('#groc-view-get')).toBeVisible();
  await page.click('#groc-view-get');
  await expect(sortBox(page)).toHaveValue('name'); // To get remembers its own choice
});

test('ticking a row that moves under Not ticked first keeps keyboard focus on its box', async ({ page }) => {
  await seed(page);
  await open(page, 'home');
  await sortBox(page).selectOption('open');
  const box = page.locator('#groc-have-apple');
  await box.focus();
  await page.keyboard.press('Space');
  await expect(box).toBeChecked();
  await expect(box).toBeFocused();
  expect(await rowNames(page, '.ghome')).toEqual(['Árbol chili', 'Bread', 'Eggs', 'Apples', 'Rice']);
});

test('search finds part of a name ignoring case and accents, says when nothing matches, and clears cleanly', async ({ page }) => {
  await seed(page);
  await open(page, 'home');
  const search = page.getByRole('searchbox', { name: 'Search groceries' });
  await search.fill('ARBOL');
  expect(await rowNames(page, '.ghome')).toEqual(['Árbol chili']);
  await search.fill('zzz');
  await expect(page.locator('#groc-nomatch')).toHaveText('No items match “zzz”.');
  await search.press('Escape');
  await expect(search).toHaveValue('');
  expect(await rowNames(page, '.ghome')).toHaveLength(5);
  await expect(page.locator('#groc-nomatch')).toHaveCount(0);
});

test('To get: price order and search apply to the shown list while the count stays for the whole month', async ({ page }) => {
  await seed(page);
  await open(page, 'get');
  const names = () => page.locator('.gget .gnamebtn').evaluateAll(els => els.map(e => e.firstChild.textContent));
  expect(await names()).toEqual(['Apples', 'Árbol chili', 'Bread', 'Eggs']);
  await sortBox(page).selectOption('price');
  expect(await names()).toEqual(['Árbol chili', 'Apples', 'Eggs', 'Bread']);
  await page.getByRole('searchbox', { name: 'Search groceries' }).fill('e');
  expect(await names()).toEqual(['Apples', 'Eggs', 'Bread']);
  await page.getByRole('searchbox', { name: 'Search groceries' }).fill('egg');
  expect(await names()).toEqual(['Eggs']);
  await expect(page.locator('#groc-summary')).toContainText('Got 0 of 4'); // the tallies still see the whole month (Rice is had, so it is not on the list)
});

test('a browser that blocks storage still shows A to Z and keeps working', async ({ page }) => {
  await page.addInitScript(() => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) { if (String(k).startsWith('ironlog:sort:')) throw new Error('blocked'); return real.call(this, k); };
    Storage.prototype.setItem = new Proxy(Storage.prototype.setItem, { apply(t, th, a) { if (String(a[0]).startsWith('ironlog:sort:')) throw new Error('blocked'); return Reflect.apply(t, th, a); } });
  });
  await page.reload();
  await seed(page);
  await open(page, 'home');
  await expect(sortBox(page)).toHaveValue('name');
  await sortBox(page).selectOption('price');
  await expect(sortBox(page)).toHaveValue('price');
});
