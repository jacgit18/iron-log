import { test, expect } from './fixtures.js';

// The shared sort control on the Exercise library. A unit test cannot see the real select, the choice surviving a real reload in
// localStorage, or the page working when storage is blocked.
const seed = page => page.addInitScript(() => {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  const mk = (n, d) => Array.from({ length: n }, (_, i) => ({ id: `${d}-${i}`, d, w: 100, s: 3, r: 8, ph: 'hyp' }));
  localStorage.setItem('ironlog:logs/hack', JSON.stringify({ entries: mk(3, '2026-09-01') }));      // most used
  localStorage.setItem('ironlog:logs/zottman', JSON.stringify({ entries: mk(1, '2026-09-22') }));   // most recent
});
const open = async page => {
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Exercise library', exact: true }).click();
  return page.locator('.exlib');
};
const names = lib => lib.locator('.exrow b').allTextContents();

test('choosing a sort reorders the library, is remembered after reload, and is reachable by keyboard', async ({ page }) => {
  await seed(page);
  await page.reload();
  const lib = await open(page);
  const sort = lib.getByRole('combobox', { name: 'Sort' });
  await expect(sort).toHaveValue('name');
  const alpha = await names(lib);
  expect(alpha).toEqual([...alpha].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })));

  await sort.focus();
  await sort.selectOption('used');
  await expect(lib.locator('.exrow b').first()).toHaveText('Hack Squat');
  await sort.selectOption('last');
  await expect(lib.locator('.exrow b').first()).toHaveText('Zottman Curl');

  await page.reload();
  const lib2 = await open(page);
  await expect(lib2.getByRole('combobox', { name: 'Sort' })).toHaveValue('last');
  await expect(lib2.locator('.exrow b').first()).toHaveText('Zottman Curl');

  // Back to the default clears the memory.
  await lib2.getByRole('combobox', { name: 'Sort' }).selectOption('name');
  expect(await page.evaluate(() => localStorage.getItem('ironlog:sort:exercises'))).toBeNull();
});

test('a browser that blocks storage still shows the default order', async ({ page }) => {
  await page.addInitScript(() => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) { if (String(k).startsWith('ironlog:sort:')) throw new Error('blocked'); return real.call(this, k); };
    Storage.prototype.setItem = new Proxy(Storage.prototype.setItem, { apply(t, th, a) { if (String(a[0]).startsWith('ironlog:sort:')) throw new Error('blocked'); return Reflect.apply(t, th, a); } });
  });
  await page.reload();
  const lib = await open(page);
  const sort = lib.getByRole('combobox', { name: 'Sort' });
  await expect(sort).toHaveValue('name');
  await sort.selectOption('used'); // the page keeps working
  await expect(sort).toHaveValue('used');
});
