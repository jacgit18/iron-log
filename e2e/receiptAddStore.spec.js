import { test, expect } from './fixtures.js';
import { photo } from './receiptHelpers.js';

// Receipt adds its store (brief receipt-add-store). The name cleanup and Undo order are node tests; this covers the wiring: the box with the tidied name on a list with no
// stores, Apply creating the store and marking the items bought there, Undo removing it, and the box off or hidden. The route is stubbed. Month 2026-09.
const item = (id, n, store, cents = 300) => ({ id, n, store, qty: 1, cents, every: true, out: false });
const lines = [
  { text: 'EGGS LRG', qty: 1, grossCents: 500, discountCents: 0, matchId: 'eggs' },
  { text: 'RICE 20LB', qty: 1, grossCents: 700, discountCents: 0, matchId: 'rice' },
];
const seed = async (page, stores = []) => {
  await page.evaluate(stores => {
    localStorage.setItem('ironlog:session/admin', 'true');
    localStorage.setItem('ironlog:grocery/main', JSON.stringify({ stores, items: [{ id: 'eggs', n: 'Eggs', store: '', qty: 1, cents: 500, every: true, out: false }, { id: 'rice', n: 'Rice', store: '', qty: 1, cents: 700, every: true, out: false }] }));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify({ lines: {}, pulled: [] }));
  }, stores);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-get');
};
const answer = (page, store) => page.route('**/api/scan/receipt', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { kind: 'ok', receipt: { store, date: '2026-09-10', lines } } }) }));
const stores = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/main')).stores);
const month = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/2026-09') ?? '{"lines":{}}').lines);
const scan = async page => { await page.getByLabel('Receipt photo').setInputFiles(photo); return page.getByRole('dialog'); };

test('a store the list does not have is offered with a tidy name, Apply adds it and marks the items bought there, and Undo removes it', async ({ page }) => {
  await seed(page); await answer(page, 'COSTCO WHOLESALE #123');
  const sheet = await scan(page);
  await expect(sheet.getByLabel('Add this store to your stores')).toBeChecked();
  await expect(sheet.getByLabel('Store name')).toHaveValue('Costco');
  await expect(sheet.getByText('2 items will be marked bought at Costco this month.')).toBeVisible();
  expect(await stores(page)).toEqual([]); // nothing is saved before Apply
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  expect(await stores(page)).toEqual(['Costco']);
  expect((await month(page)).eggs).toMatchObject({ got: true }); // eggs had no store, so the box starts ticked and Costco becomes its usual store: no month note needed
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/main')).items.find(i => i.id === 'eggs').store)).toBe('Costco');
  await expect(page.getByText('Added the store Costco.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await stores(page)).toEqual([]);
  expect(await month(page)).toEqual({});
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/main')).items.find(i => i.id === 'eggs').store)).toBe(''); // Undo gives eggs its old usual store back (none), though the new store was made in the same Apply
});

test('the name can be edited, and unticking the box adds nothing and moves nothing', async ({ page }) => {
  await seed(page); await answer(page, 'COSTCO WHOLESALE #123');
  let sheet = await scan(page);
  await sheet.getByLabel('Store name').fill('Costco Warehouse');
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  expect(await stores(page)).toEqual(['Costco Warehouse']);
  await page.getByRole('button', { name: 'Undo' }).click();
  sheet = await scan(page);
  await sheet.getByLabel('Add this store to your stores').uncheck();
  await expect(sheet.getByLabel('Store name')).toHaveCount(0);
  await expect(sheet.getByText('will be marked bought at')).toHaveCount(0);
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  expect(await stores(page)).toEqual([]);
});

test('a store already on the list gets no box', async ({ page }) => {
  await seed(page, ['Costco']); await answer(page, 'COSTCO WHOLESALE #123');
  const sheet = await scan(page);
  await expect(sheet.getByLabel('Add this store to your stores')).toHaveCount(0);
  await expect(sheet.getByText('2 items will be marked bought at Costco this month.')).toBeVisible();
});

test('a name that cannot be a store says so, Apply stays off and nothing is written', async ({ page }) => {
  await seed(page); await answer(page, 'COSTCO WHOLESALE #123');
  const sheet = await scan(page);
  await sheet.getByLabel('Store name').fill('constructor');
  await expect(sheet.getByRole('alert')).toContainText('can’t be used for a store');
  await expect(sheet.getByRole('button', { name: /^Apply/ })).toBeDisabled();
  await sheet.getByLabel('Store name').fill('Costco');
  await expect(sheet.getByRole('button', { name: /^Apply/ })).toBeEnabled();
  expect(await stores(page)).toEqual([]);
  expect(await month(page)).toEqual({});
});
