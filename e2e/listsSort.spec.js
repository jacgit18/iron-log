import { test, expect } from './fixtures.js';

// Sort on the Program library, the Progress lifts list and the Exercise frequency goals. A unit test cannot see the real select,
// the choice surviving a reload in localStorage per list, or the page working when storage is blocked.
const seed = page => page.addInitScript(() => {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  const mk = (n, d) => Array.from({ length: n }, (_, i) => ({ id: `${d}-${i}`, d, w: 100, s: 3, r: 8, ph: 'hyp' }));
  localStorage.setItem('ironlog:logs/hack', JSON.stringify({ entries: mk(3, '2026-09-01') }));
  localStorage.setItem('ironlog:logs/zottman', JSON.stringify({ entries: mk(1, '2026-09-22') }));
});
const sortOf = scope => scope.getByRole('combobox', { name: 'Sort' });
const goto = async (page, hash) => { await page.evaluate(h => { location.hash = h; }, hash); };

test('Progress lifts: Most recent by default, Name A to Z reorders, the choice survives a reload', async ({ page }) => {
  await seed(page);
  await page.reload();
  await goto(page, '#/progress/lifts');
  const titles = page.locator('.pcard h3');
  await expect(sortOf(page)).toHaveValue('recent');
  await expect(titles.first()).toHaveText('Zottman Curl');
  await sortOf(page).selectOption('name');
  await expect(titles.first()).toHaveText('Hack Squat');
  await page.reload();
  await expect(sortOf(page)).toHaveValue('name');
  await expect(titles.first()).toHaveText('Hack Squat');
  await sortOf(page).selectOption('recent');
  expect(await page.evaluate(() => localStorage.getItem('ironlog:sort:lifts'))).toBeNull();
});

test('Program library: Newest first by default, Name A to Z reorders, and each list keeps its own choice', async ({ page }) => {
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Programs', exact: true }).click();
  for (const n of ['Zebra block', 'Alpha block']) {
    await page.getByRole('textbox', { name: /^Save Program A as/ }).fill(n);
    await page.getByRole('button', { name: 'Save a copy' }).click();
    await expect(page.locator('.lib > .edlist .edrow', { hasText: n })).toBeVisible();
  }
  const rows = page.locator('.lib > .edlist .edrow b');
  const sort = sortOf(page.locator('.lib'));
  await expect(sort).toHaveValue('newest');
  await sort.selectOption('name');
  const first = (await rows.allTextContents())[0];
  expect(first.toLowerCase()).toBe('alpha block');
  await page.reload();
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Programs', exact: true }).click();
  await expect(sortOf(page.locator('.lib'))).toHaveValue('name');
  // The Exercise library's own choice is untouched.
  expect(await page.evaluate(() => localStorage.getItem('ironlog:sort:exercises'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('ironlog:sort:programs'))).toBe('name');
});

test('Exercise frequency: Closest to goal puts the goal with the most done first, Name A to Z the reverse', async ({ page }) => {
  await seed(page);
  await page.reload();
  await goto(page, '#/progress/freq');
  for (const ex of ['Hack Squat', 'Zottman Curl']) {
    await page.getByRole('combobox', { name: 'Exercise', exact: true }).selectOption({ label: ex });
    await page.getByRole('combobox', { name: 'Times a week' }).selectOption('3');
    await page.getByRole('button', { name: /^(Set|Add) a goal$/ }).click();
    await expect(page.locator('.freqname', { hasText: ex })).toBeVisible();
  }
  const names = page.locator('.freqname');
  const sort = sortOf(page.locator('.freqgoals'));
  await sort.selectOption('closest');
  await expect(names.first()).toHaveText('Zottman Curl');
  await sort.selectOption('name');
  await expect(names.first()).toHaveText('Hack Squat');
});

test('a browser that blocks storage still shows the default order and the control works', async ({ page }) => {
  await page.addInitScript(() => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) { if (String(k).startsWith('ironlog:sort:')) throw new Error('blocked'); return real.call(this, k); };
    Storage.prototype.setItem = new Proxy(Storage.prototype.setItem, { apply(t, th, a) { if (String(a[0]).startsWith('ironlog:sort:')) throw new Error('blocked'); return Reflect.apply(t, th, a); } });
  });
  await seed(page);
  await page.reload();
  await goto(page, '#/progress/lifts');
  await expect(sortOf(page)).toHaveValue('recent');
  await sortOf(page).selectOption('name');
  await expect(sortOf(page)).toHaveValue('name');
  await expect(page.locator('.pcard h3').first()).toHaveText('Hack Squat');
});
