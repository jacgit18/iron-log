import { test, expect } from './fixtures.js';
import { photo } from './receiptHelpers.js';

// Receipt share (brief receipt-share): who shares what a receipt buys, set on the receipt sheet. The pure parts (choices, owed text, the shares Apply writes) are node tests
// (receiptShare.test.ts, groceryReceiptShare.test.ts, sharingIntent.test.ts); this covers the wiring: the box with a group, a line chip beating it, Apply writing the month line
// only and Undo putting it back, and with no group the offer, Not now, and the round trip to Sharing and back to the same receipt. The scan route is stubbed. The date is September 2026.
const item = (id, n, store, cents) => ({ id, n, store, qty: 1, cents, every: true, out: false });
const CATALOGUE = { stores: ["BJ's"], items: [item('eggs', 'Eggs', "BJ's", 1349), item('rice', 'Rice', "BJ's", 500)] };
const GROUP = { id: 'g1', n: 'Home', people: [{ id: 'sam', n: 'Sam' }, { id: 'alex', n: 'Alex' }], stores: [] };
const answer = page => page.route('**/api/scan/receipt', async route => {
  const { items } = route.request().postDataJSON();
  const id = n => items.find(i => i.n === n)?.id ?? null;
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { kind: 'ok', receipt: { store: "BJ's", date: '2026-09-24', taxCents: 0, totalCents: 1849, lines: [
    { text: 'EGGS LRG', qty: 1, grossCents: 1349, discountCents: 0, matchId: id('Eggs') },
    { text: 'RICE 5LB', qty: 1, grossCents: 500, discountCents: 0, matchId: id('Rice') },
  ] } } }) });
});
const open = async (page, { group }) => {
  await page.evaluate(({ CATALOGUE, group, GROUP }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(group ? { ...CATALOGUE, groups: [GROUP] } : CATALOGUE));
  }, { CATALOGUE, group, GROUP });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-shopping');
  await answer(page);
  await page.getByLabel('Receipt photo').setInputFiles(photo);
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Receipt', exact: true })).toBeVisible();
};
const monthLines = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/2026-09') || '{}').lines ?? {});
const catalogue = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:grocery/main') || '{}'));

test.describe('with a sharing group', () => {
  test('the box splits the whole receipt, a line chip beats it, Apply writes the month lines only, and Undo puts them back', async ({ page }) => {
    await open(page, { group: true });
    const sheet = page.getByRole('dialog');
    const box = sheet.getByRole('group', { name: 'Split this receipt' });
    await expect(box).toBeVisible();
    await expect(box.getByText('All yours: $18.49')).toBeVisible();
    await box.getByLabel('Shared with, for this receipt: Just me').click();
    await box.getByLabel('Sam').check();
    await expect(box.getByText('Sam owes you $9.25 · your share $9.24')).toBeVisible(); // 18.49 split two ways, the odd cent stays with you
    await sheet.getByLabel('Shared with, for EGGS LRG: Me +1').click();
    await sheet.locator('details.gshare', { has: page.getByLabel(/for EGGS LRG/) }).getByLabel('Sam').uncheck();
    await expect(sheet.getByLabel('Shared with, for EGGS LRG: Just me')).toBeVisible();
    await expect(box.getByText('Sam owes you $2.50 · your share $15.99')).toBeVisible(); // only the rice ($5.00) is still split with Sam
    await sheet.getByRole('button', { name: /^Apply/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const lines = await monthLines(page);
    expect(Object.values(lines).map(l => l.share).sort((a, b) => a.with.length - b.with.length)).toEqual([{ with: [] }, { with: ['sam'] }]);
    expect((await catalogue(page)).items.every(i => !i.share)).toBe(true); // the items' usual split is not changed
    await page.getByRole('button', { name: 'Undo' }).click();
    expect(Object.keys(await monthLines(page))).toEqual([]);
  });

  test('a line that is not ticked has no chip, and closing the sheet writes nothing', async ({ page }) => {
    await open(page, { group: true });
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Include RICE 5LB').uncheck();
    await expect(sheet.getByLabel(/Shared with, for RICE 5LB/)).toHaveCount(0);
    await sheet.getByLabel('Shared with, for this receipt: Just me').click();
    await sheet.getByRole('group', { name: 'Split this receipt' }).getByLabel('Sam').check();
    await sheet.getByRole('button', { name: 'Close without applying' }).click();
    expect(Object.keys(await monthLines(page))).toEqual([]);
  });
});

test('Who owes who reads the shares Apply wrote', async ({ page }) => {
  await open(page, { group: true });
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Shared with, for this receipt: Just me').click();
  await sheet.getByRole('group', { name: 'Split this receipt' }).getByLabel('Sam').check();
  await sheet.getByRole('button', { name: /^Apply/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.click('#groc-view-bought');
  const toggle = page.locator('.gsplittoggle');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await expect(page.getByRole('region', { name: 'Who owes who' })).toContainText('Sam owes you');
});

test.describe('with no sharing group', () => {
  test('the offer shows, Not now folds it to a link, and Split it brings it back', async ({ page }) => {
    await open(page, { group: false });
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('group', { name: 'Split this receipt' })).toContainText('Split this receipt?');
    await expect(sheet.getByLabel(/Shared with/)).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Not now' }).click();
    await expect(sheet.getByRole('group', { name: 'Split this receipt' })).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Split it' }).click();
    await expect(sheet.getByRole('button', { name: 'Make a sharing group' })).toBeVisible();
  });

  test('Make a sharing group opens Sharing on Inventory, and after Done the same receipt comes back with the box', async ({ page }) => {
    await open(page, { group: false });
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Make a sharing group' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/daily\/grocery\/inventory$/);
    const panel = page.getByRole('region', { name: 'Sharing' });
    await expect(panel).toBeVisible();
    await page.getByLabel('New group', { exact: true }).fill('Home');
    await page.getByLabel('People in the new group, separated by commas').fill('Sam, Alex');
    await page.getByRole('button', { name: 'Add group' }).click();
    await panel.getByRole('button', { name: 'Done' }).click();
    const back = page.getByRole('dialog');
    await expect(back.getByRole('heading', { name: 'Receipt', exact: true })).toBeVisible();
    await expect(back.getByRole('group', { name: 'Split this receipt' })).toContainText('All yours');
    await expect(back.getByLabel('Shared with, for this receipt: Just me')).toBeVisible();
  });

  test('after the round trip the sheet keeps its edits, and Apply shows the Applied notice with Undo', async ({ page }) => {
    await open(page, { group: false });
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Item for RICE 5LB').selectOption({ label: 'Not on your list' }); // an edit made before leaving
    await sheet.getByRole('button', { name: 'Make a sharing group' }).click();
    await page.getByLabel('New group', { exact: true }).fill('Home');
    await page.getByLabel('People in the new group, separated by commas').fill('Sam');
    await page.getByRole('button', { name: 'Add group' }).click();
    await page.getByRole('region', { name: 'Sharing' }).getByRole('button', { name: 'Done' }).click();
    const back = page.getByRole('dialog');
    await expect(back.getByRole('heading', { name: 'Receipt', exact: true })).toBeVisible();
    await expect(back.getByLabel('Item for RICE 5LB')).toHaveValue(''); // still unmatched, as it was left
    await back.getByRole('button', { name: /^Apply/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible(); // the reopened sheet has this screen's own callbacks
    await page.getByRole('button', { name: 'Undo' }).click();
    expect(Object.keys(await monthLines(page))).toEqual([]);
  });

  test('opening Sharing any other way does not reopen a receipt', async ({ page }) => {
    await page.evaluate(({ CATALOGUE }) => localStorage.setItem('ironlog:grocery/main', JSON.stringify(CATALOGUE)), { CATALOGUE });
    await page.reload();
    await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-inventory');
    await page.click('#groc-sharing-prompt');
    await page.getByLabel('New group', { exact: true }).fill('Home');
    await page.getByRole('button', { name: 'Add group' }).click();
    await page.getByRole('region', { name: 'Sharing' }).getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
