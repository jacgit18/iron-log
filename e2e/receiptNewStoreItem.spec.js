import { test, expect } from './fixtures.js';
import { photo } from './receiptHelpers.js';

// A new item added from the receipt sheet defaults to the store the receipt is adding (owner request 2026-11-07). The draft and staging rules are node tests (groceryReceipt.test.ts);
// this covers the wiring: the Store choice lists "<store> (new)" and starts on it, Apply makes the store and the item there, an untick sends the item to Anywhere, and a renamed
// store carries the item with it. The route is stubbed. Month 2026-09.
const lines = [
  { text: 'EGGS LRG', qty: 1, grossCents: 500, discountCents: 0, matchId: 'eggs' },
  { text: 'ZEVIA SODA 12PK', qty: 1, grossCents: 699, discountCents: 0, matchId: null },
];
const seed = async (page, stores = []) => {
  await page.evaluate(stores => {
    localStorage.setItem('ironlog:session/admin', 'true');
    localStorage.setItem('ironlog:grocery/main', JSON.stringify({ stores, items: [{ id: 'eggs', n: 'Eggs', store: '', qty: 1, cents: 500, every: true, out: false }] }));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify({ lines: {}, pulled: [] }));
  }, stores);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-shopping');
};
const answer = page => page.route('**/api/scan/receipt', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { kind: 'ok', receipt: { store: 'TARGET #1234', date: '2026-09-10', lines } } }) }));
const grocery = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/main')));
const scan = async page => { await page.getByLabel('Receipt photo').setInputFiles(photo); return page.getByRole('dialog'); };
const stage = async sheet => {
  await sheet.getByRole('button', { name: 'Add to list: ZEVIA SODA 12PK' }).click();
  return sheet.locator('#rc-new-store');
};

test('the Store choice lists the new store and starts on it, and Apply makes the store and the item there', async ({ page }) => {
  await seed(page); await answer(page);
  const sheet = await scan(page);
  const store = await stage(sheet);
  await expect(store.locator('option')).toHaveText(['Anywhere', 'Target (new)']);
  await expect(store.locator('option:checked')).toHaveText('Target (new)');
  await sheet.getByRole('button', { name: 'Add item' }).click();
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  const g = await grocery(page);
  expect(g.stores).toEqual(['Target']);
  expect(g.items.find(i => i.n === 'Zevia soda 12pk' || /zevia/i.test(i.n))?.store).toBe('Target');
});

test('unticking the add-store box sends the new item to Anywhere, and no store is made', async ({ page }) => {
  await seed(page); await answer(page);
  const sheet = await scan(page);
  await stage(sheet);
  await sheet.getByRole('button', { name: 'Add item' }).click();
  await sheet.getByLabel('Add this store to your stores').uncheck();
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  const g = await grocery(page);
  expect(g.stores).toEqual([]);
  expect(g.items.find(i => /zevia/i.test(i.n))?.store).toBe('');
});

test('renaming the new store before Apply carries the item to the new name, and the Store choice can still pick Anywhere', async ({ page }) => {
  await seed(page); await answer(page);
  const sheet = await scan(page);
  const store = await stage(sheet);
  await store.selectOption('');
  await expect(store.locator('option:checked')).toHaveText('Anywhere');
  await sheet.getByRole('button', { name: 'Not now' }).click();
  await stage(sheet);
  await sheet.getByRole('button', { name: 'Add item' }).click();
  await sheet.getByLabel('Store name').fill('Target Plus');
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  const g = await grocery(page);
  expect(g.stores).toEqual(['Target Plus']);
  expect(g.items.find(i => /zevia/i.test(i.n))?.store).toBe('Target Plus');
});

test('renaming the new store to one the list has, with the form open, leaves the Store choice on Anywhere and the item there', async ({ page }) => {
  await seed(page, ['Aldi']); await answer(page);
  const sheet = await scan(page);
  const store = await stage(sheet);
  await expect(store.locator('option:checked')).toHaveText('Target (new)');
  await sheet.getByLabel('Store name').fill('aldi');
  await expect(store.locator('option')).toHaveText(['Anywhere', 'Aldi']);
  await expect(store.locator('option:checked')).toHaveText('Anywhere');
  await sheet.getByRole('button', { name: 'Add item' }).click();
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  const g = await grocery(page);
  expect(g.stores).toEqual(['Aldi']);
  expect(g.items.find(i => /zevia/i.test(i.n))?.store).toBe('');
});

test('an item added while the box is unticked stays on Anywhere when the box is ticked again', async ({ page }) => {
  await seed(page); await answer(page);
  const sheet = await scan(page);
  await sheet.getByLabel('Add this store to your stores').uncheck();
  await stage(sheet);
  await sheet.getByRole('button', { name: 'Add item' }).click();
  await sheet.getByLabel('Add this store to your stores').check();
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  const g = await grocery(page);
  expect(g.stores).toEqual(['Target']);
  expect(g.items.find(i => /zevia/i.test(i.n))?.store).toBe('');
});
