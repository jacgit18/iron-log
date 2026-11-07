import { test, expect } from './fixtures.js';
import { photo } from './receiptHelpers.js';

// Receipt bought-at store (brief receipt-bought-at). The plan, the words and the writes are node tests (groceryReceiptMoves.test.ts); this covers the wiring a unit test
// cannot: the sheet's "Bought at" notes and warning, Apply marking items bought at the receipt's store for the month without touching At home, the opt-in usual store,
// a refused duplicate, a store that is not on the list, and Undo. The route is stubbed. The fixed date is in September 2026 (month 2026-09).
const item = (id, n, store, cents = 300) => ({ id, n, store, qty: 1, cents, every: true, out: false });
const CAT = { stores: ["BJ's", 'Aldi'], items: [item('eggs', 'Eggs', 'Aldi', 500), item('rice', 'Rice', '', 700), item('tp', 'Toilet paper', "BJ's", 2499)],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }], stores: ["BJ's"] }] };
const lines = [
  { text: 'EGGS LRG', qty: 1, grossCents: 500, discountCents: 0, matchId: 'eggs' },
  { text: 'RICE 20LB', qty: 1, grossCents: 700, discountCents: 0, matchId: 'rice' },
  { text: 'KS TOILET PAPER', qty: 1, grossCents: 2499, discountCents: 0, matchId: 'tp' },
];
const seed = async (page, cat = CAT) => {
  await page.evaluate(cat => {
    localStorage.setItem('ironlog:session/admin', 'true');
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(cat));
    localStorage.setItem('ironlog:grocery/2026-09', JSON.stringify({ lines: {}, pulled: [] }));
  }, cat);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-get');
};
const answer = (page, store) => page.route('**/api/scan/receipt', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { kind: 'ok', receipt: { store, date: '2026-09-10', lines } } }) }));
const month = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/2026-09') ?? '{"lines":{}}').lines);
const usual = (page, id) => page.evaluate(id => JSON.parse(localStorage.getItem('ironlog:grocery/main')).items.find(i => i.id === id).store, id);
const scan = async page => { await page.getByLabel('Receipt photo').setInputFiles(photo); return page.getByRole('dialog'); };

test('rows say where each item was bought, Apply marks them bought at BJ\'s for the month and leaves At home alone, and Undo puts them back', async ({ page }) => {
  await seed(page); await answer(page, "BJ'S WHOLESALE CLUB");
  const sheet = await scan(page);
  await expect(sheet.getByText("Bought at BJ's (usually Aldi)")).toHaveCount(1);
  await expect(sheet.getByText("Bought at BJ's (usually Anywhere)")).toHaveCount(1);
  await expect(sheet.locator('.rcatnote')).toHaveCount(2); // the toilet paper is at BJ's already: no note
  await expect(sheet.getByText("2 items will be marked bought at BJ's this month.")).toBeVisible();
  await expect(sheet.getByText('changes who shares them')).toBeVisible(); // Aldi and Anywhere have no group, BJ's splits with Sister
  await expect(sheet.getByText("At home stays as it is. Tick the box to list these under BJ's there.")).toBeVisible(); // mixed usual stores: the box starts unticked
  expect(await month(page)).toEqual({}); // nothing is written before Apply
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  const after = await month(page);
  expect(after.eggs).toMatchObject({ got: true, store: "BJ's" });
  expect(after.rice).toMatchObject({ got: true, store: "BJ's" });
  expect(after.tp.store).toBeUndefined();
  expect(await usual(page, 'eggs')).toBe('Aldi'); // At home is unchanged
  expect(await usual(page, 'rice')).toBe('');
  await expect(page.getByText("2 marked bought at BJ's.", { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await month(page)).toEqual({});
});

test('ticking Also make BJ\'s the usual store changes At home, and Undo changes it back', async ({ page }) => {
  await seed(page); await answer(page, "BJ's");
  const sheet = await scan(page);
  await sheet.getByLabel("Also make BJ's the usual store for these items").check();
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  expect(await usual(page, 'eggs')).toBe("BJ's");
  expect(await usual(page, 'rice')).toBe("BJ's");
  expect((await month(page)).eggs.store).toBeUndefined(); // it is the usual store now, so no month override is needed
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await usual(page, 'eggs')).toBe('Aldi');
  expect(await usual(page, 'rice')).toBe('');
});

test('an item whose name is already at BJ\'s is refused as the usual store, stays bought at BJ\'s this month, and the notice says so', async ({ page }) => {
  await seed(page, { ...CAT, items: [...CAT.items, item('eggs2', 'Eggs', "BJ's", 450)] }); await answer(page, "BJ's");
  const sheet = await scan(page);
  await sheet.getByLabel("Also make BJ's the usual store for these items").check();
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  expect(await usual(page, 'eggs')).toBe('Aldi'); // refused
  expect(await usual(page, 'rice')).toBe("BJ's");
  expect((await month(page)).eggs.store).toBe("BJ's"); // still bought at BJ's this month
  await expect(page.getByText('except Eggs', { exact: false })).toBeVisible();
});

test('a store that is not on the list moves nothing until one is picked', async ({ page }) => {
  await seed(page); await answer(page, 'WALMART SUPERCENTER');
  const sheet = await scan(page);
  await expect(sheet.getByLabel('Store for this receipt', { exact: false })).toBeVisible();
  await sheet.getByLabel('Add this store to your stores').uncheck(); // brief receipt-add-store: ticked, Walmart would become a store; this test is about no store
  await expect(sheet.locator('.rcatnote')).toHaveCount(0);
  await expect(sheet.getByLabel("Also make", { exact: false })).toHaveCount(0);
  await sheet.getByLabel('Store for this receipt', { exact: false }).selectOption('Aldi');
  await expect(sheet.getByText("Bought at Aldi (usually Anywhere)")).toHaveCount(1); // rice
  await expect(sheet.getByText("Bought at Aldi (usually BJ's)")).toHaveCount(1); // toilet paper
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  const after = await month(page);
  expect(after.rice.store).toBe('Aldi');
  expect(after.tp.store).toBe('Aldi');
  expect(after.eggs.store).toBeUndefined(); // already at Aldi
});
