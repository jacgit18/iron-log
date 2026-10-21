import { expect, newPhone, server, test } from './stack.js';

// ADR 039: the grocery list is stored in the account. The whole stack, nothing mocked. The clock is fixed in September 2026.
const MONTH = '2026-09';
const openGroceries = async page => { await page.click('#tab-daily'); await page.click('#daily-grocery'); await expect(page.locator('#groc-h')).toBeVisible(); };
// Adds an item from At home's Edit mode, then leaves Edit mode.
const addItem = async (page, n, store) => {
  await page.click('#groc-view-home');
  await page.click('#groc-edit');
  if (!(await page.locator('#groc-store').count())) await page.click('#groc-more'); // store, count and price sit under More
  await page.fill('#groc-name', n); await page.fill('#groc-store', store); await page.fill('#groc-qty', '1'); await page.fill('#groc-price', '');
  await page.click('#groc-add');
  await expect(page.locator('#groc-name')).toHaveValue('');
  await page.click('#groc-edit');
};
const reload = async page => {
  await page.reload();
  await expect(page.locator('#live-status')).not.toContainText('Loading…', { timeout: 30_000 });
};
const item = (id, n, over = {}) => ({ id, n, store: '', qty: 1, cents: null, every: true, out: false, ...over });

test('an item and a tick made on one phone reach the account, show on a second phone, and survive a reload', async ({ browser, user }) => {
  await server.seedPrograms(user); // an account with data, so the one-time upload card stays out of the way
  const a = await newPhone(browser, user);
  const page = await a.open();
  await openGroceries(page);
  await addItem(page, 'Kale', 'Aldi', true);
  await page.click('#groc-view-get');
  await page.locator('#groc-kale').check();
  await expect.poll(() => server.grocery(user), { message: 'the item, its store and the tick reach the database' })
    .toEqual({ items: ['kale'], stores: ['Aldi'], months: { [MONTH]: { lines: { kale: { got: true, qty: 1 } }, pulled: [] } } });

  // A second phone with nothing of its own sees the same list and tick.
  const b = await newPhone(browser, user);
  const second = await b.open();
  await openGroceries(second);
  await second.click('#groc-view-get');
  await expect(second.locator('#groc-kale')).toBeChecked();

  // The second phone adds an item and ticks it; the first phone picks both up and keeps its own tick.
  await addItem(second, 'Rice', 'Aldi', true);
  await second.click('#groc-view-get');
  await second.locator('#groc-rice').check();
  await expect.poll(async () => (await server.grocery(user)).months[MONTH]?.lines).toEqual({ kale: { got: true, qty: 1 }, rice: { got: true, qty: 1 } });
  await reload(page);
  await openGroceries(page);
  await page.click('#groc-view-get');
  await expect(page.locator('#groc-kale')).toBeChecked();
  await expect(page.locator('#groc-rice')).toBeChecked();

  // Reloaded, the second phone shows what the account holds, not a list of its own.
  await reload(second);
  await openGroceries(second);
  await second.click('#groc-view-get');
  await expect(second.locator('#groc-kale')).toBeChecked();
  await expect(second.locator('#groc-rice')).toBeChecked();
  expect(await second.evaluate(() => localStorage.getItem('ironlog:grocery/main'))).toBeNull(); // kept in the account, not this browser
  await a.close();
  await b.close();
});

test('the list a phone held before syncing is added to an account that already has one, once, with nothing doubled', async ({ browser, user }) => {
  await server.seedPrograms(user);
  // The account's list, made on another phone: Kale at Aldi.
  const b = await newPhone(browser, user);
  const other = await b.open();
  await openGroceries(other);
  await addItem(other, 'Kale', 'Aldi', true);
  await expect.poll(async () => (await server.grocery(user)).items).toEqual(['kale']);
  await b.close();

  // This phone kept its own list on the device before the list synced (ADR 019): the same Kale, plus Salt and a tick.
  const a = await newPhone(browser, user, {
    'grocery/main': { stores: ['Aldi'], items: [item('kale', 'Kale', { store: 'Aldi', qty: 3 }), item('salt', 'Salt', { every: false, out: true })] },
    [`grocery/${MONTH}`]: { lines: { salt: { got: true, qty: 1 } }, pulled: [] },
  });
  const page = await a.open();
  await expect.poll(() => server.grocery(user), { message: 'the device list is added to the account' })
    .toEqual({ items: ['kale', 'salt'], stores: ['Aldi'], months: { [MONTH]: { lines: { salt: { got: true, qty: 1 } }, pulled: [] } } });
  await openGroceries(page);
  await page.click('#groc-view-home');
  await expect(page.getByRole('region', { name: 'Aldi' })).toContainText('Kale');
  await expect(page.getByText('Salt')).toHaveCount(1);

  // Reloading does not add it again, even after the account's Salt is removed on this phone.
  await page.click('#groc-edit');
  await page.getByRole('button', { name: 'Expand Salt' }).click(); // edit rows start closed
  await page.getByRole('button', { name: 'Remove Salt from your list' }).click();
  await page.getByRole('button', { name: 'Remove Salt from your list' }).click();
  await expect.poll(async () => (await server.grocery(user)).items).toEqual(['kale']);
  await reload(page);
  await openGroceries(page);
  await page.click('#groc-view-home');
  await expect(page.getByRole('region', { name: 'Aldi' })).toContainText('Kale');
  expect((await server.grocery(user)).items).toEqual(['kale']);
  expect(await page.evaluate(() => localStorage.getItem('ironlog:grocery/main'))).toContain('Salt'); // the old copy stays on the device, unused
  await a.close();
});

test('an empty account takes the device list with the one-time upload of everything else', async ({ browser, user }) => {
  const a = await newPhone(browser, user, {
    'grocery/main': { stores: [], items: [item('kale', 'Kale'), item('salt', 'Salt', { every: false })] },
    [`grocery/${MONTH}`]: { lines: { kale: { got: true } }, pulled: [] },
  });
  const page = await a.open({ blank: true });
  const card = page.getByRole('status').filter({ hasText: 'Upload this device’s data?' });
  await expect(card).toContainText('2 grocery items, 1 month of groceries');
  expect((await server.grocery(user)).items).toEqual([]); // nothing goes until the user says so
  await card.getByRole('button', { name: 'Upload' }).click();
  await expect(card).toHaveCount(0);
  await expect.poll(() => server.grocery(user)).toEqual({ items: ['kale', 'salt'], stores: [], months: { [MONTH]: { lines: { kale: { got: true } }, pulled: [] } } });
  await openGroceries(page);
  await page.click('#groc-view-get');
  await expect(page.locator('#groc-kale')).toBeChecked();
  await a.close();
});
