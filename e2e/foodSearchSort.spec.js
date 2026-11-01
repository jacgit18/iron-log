import { test, expect } from './fixtures.js';

// Food search sort. A unit test cannot see the real select, the choice in localStorage across a reload, storage that throws, that the
// request is not repeated when the order changes, or that picking still works on a re-ordered list.
const diet = page => page.getByRole('region', { name: 'Diet' });
const nutrition = async page => { await page.click('#tab-daily'); await page.click('#daily-supplements'); };
const hits = [
  { id: 1, name: 'Rice, white', kcal: 130, p: 2.7 },
  { id: 2, name: 'Chicken breast', kcal: 120, p: 22 },
  { id: 3, name: 'Almonds', kcal: 580, p: 21 },
];
const stub = (page, counter) => page.route('**/api/foods/search*', route => { counter.n++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, hits }) }); });
const search = async page => { await nutrition(page); await diet(page).getByLabel('Search your past meals and recipes').fill('food'); await expect(diet(page).getByRole('list', { name: 'Food database results' })).toBeVisible(); };
const names = page => diet(page).getByRole('list', { name: 'Food database results' }).locator('button').evaluateAll(els => els.map(e => e.textContent.split(' · ')[0]));
const sortBox = page => diet(page).getByRole('combobox', { name: 'Sort' });

test('each order reorders the shown results without a new request, says it sorts only this page, and survives a reload', async ({ page }) => {
  const calls = { n: 0 };
  await stub(page, calls);
  await search(page);
  await expect(sortBox(page)).toHaveValue('relevance');
  expect(await names(page)).toEqual(['Rice, white', 'Chicken breast', 'Almonds']);
  await expect(diet(page).getByText('Sorts these 3 results only, not the whole food database.')).toBeVisible();
  const before = calls.n;
  await sortBox(page).selectOption('name');
  expect(await names(page)).toEqual(['Almonds', 'Chicken breast', 'Rice, white']);
  await sortBox(page).selectOption('kcal');
  expect(await names(page)).toEqual(['Chicken breast', 'Rice, white', 'Almonds']);
  await sortBox(page).selectOption('protein');
  expect(await names(page)).toEqual(['Chicken breast', 'Almonds', 'Rice, white']);
  expect(calls.n).toBe(before); // sorting is local
  // A pick on the re-ordered list is the right food.
  await diet(page).getByRole('button', { name: 'Almonds · 580 kcal per 100 g' }).click();
  await expect(diet(page).getByLabel('Grams')).toHaveValue('100');
  await expect(diet(page).getByText('580 kcal · 21 g protein')).toBeVisible();

  await page.reload();
  await search(page);
  await expect(sortBox(page)).toHaveValue('protein');
  expect(await names(page)).toEqual(['Chicken breast', 'Almonds', 'Rice, white']);
});

test('a browser that blocks storage still shows Best match and keeps working', async ({ page }) => {
  await page.addInitScript(() => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) { if (String(k).startsWith('ironlog:sort:')) throw new Error('blocked'); return real.call(this, k); };
    Storage.prototype.setItem = new Proxy(Storage.prototype.setItem, { apply(t, th, a) { if (String(a[0]).startsWith('ironlog:sort:')) throw new Error('blocked'); return Reflect.apply(t, th, a); } });
  });
  await stub(page, { n: 0 });
  await page.reload();
  await search(page);
  await expect(sortBox(page)).toHaveValue('relevance');
  await sortBox(page).selectOption('name');
  expect(await names(page)).toEqual(['Almonds', 'Chicken breast', 'Rice, white']);
});
