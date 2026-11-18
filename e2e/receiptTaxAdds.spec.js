import { test, expect } from './fixtures.js';
import { photo } from './receiptHelpers.js';

// Receipt tax adds up (brief receipt-tax-adds-up). The sums, the ledger, Undo and the sync merge are node tests (groceryLedger, groceryReceipt, groceryReceiptMoney, grocerySplitSync);
// this covers the wiring: a second receipt from one store adds its tax to the first on To get, the "From N receipts" note, the Already applied notice with its tick, and Undo of one receipt.
// The route is stubbed: no photo leaves the test. Eggs 10.00 on every receipt; tax 1.00 (Sep 24) and 2.00 (Oct 2).
const asAdmin = page => page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true'));
const setup = async page => {
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-edit');
  await page.fill('#groc-name', 'Eggs'); await page.click('#groc-add'); await expect(page.locator('#groc-name')).toHaveValue('');
  await page.click('#groc-done');
  await page.click('#groc-view-shopping');
};
const RECEIPTS = { first: { date: '2026-09-24', taxCents: 100, totalCents: 1100 }, second: { date: '2026-10-02', taxCents: 200, totalCents: 1200 } };
const open = async (page, which) => {
  await page.unroute('**/api/scan/receipt').catch(() => {});
  await page.route('**/api/scan/receipt', async route => {
    const { items } = route.request().postDataJSON();
    const receipt = { store: "BJ'S", ...RECEIPTS[which], lines: [{ text: 'EGGS', qty: 1, grossCents: 1000, discountCents: 0, matchId: items.find(i => i.n === 'Eggs')?.id ?? null }] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { kind: 'ok', receipt } }) });
  });
  await page.getByLabel('Receipt photo').setInputFiles(photo);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Receipt' })).toBeVisible();
  return sheet;
};
const tax = page => page.getByLabel(/^Tax at .*dollars/);

test.beforeEach(async ({ page }) => { await asAdmin(page); await page.reload(); await setup(page); });

test('a second receipt from the same store adds its tax, the box says from 2 receipts, and Undo takes back only that receipt', async ({ page }) => {
  let sheet = await open(page, 'first');
  await sheet.locator('#rc-apply').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.click('#groc-view-bought');
  await expect(tax(page)).toHaveValue('1.00');
  await expect(page.getByText('From 1 receipt')).toBeVisible();
  await page.click('#groc-view-shopping');
  sheet = await open(page, 'second');
  await expect(sheet.locator('.rcdup')).toHaveCount(0);
  await sheet.locator('#rc-apply').click();
  await page.click('#groc-view-bought');
  await expect(tax(page)).toHaveValue('3.00');
  await expect(page.getByText('From 2 receipts')).toBeVisible();
});

test('Undo of the second receipt takes back only its tax', async ({ page }) => {
  let sheet = await open(page, 'first');
  await sheet.locator('#rc-apply').click();
  sheet = await open(page, 'second');
  await sheet.locator('#rc-apply').click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.click('#groc-view-bought');
  await expect(tax(page)).toHaveValue('1.00');
});

test('the same receipt again is noticed: its tax is not added unless the tick is on', async ({ page }) => {
  let sheet = await open(page, 'first');
  await sheet.locator('#rc-apply').click();
  await page.click('#groc-view-shopping');
  sheet = await open(page, 'first');
  await expect(sheet.locator('.rcdup')).toContainText('Already applied');
  await sheet.locator('#rc-apply').click();
  await page.click('#groc-view-bought');
  await expect(tax(page)).toHaveValue('1.00');
  await page.click('#groc-view-shopping');
  sheet = await open(page, 'first');
  await sheet.locator('#rc-again').check();
  await sheet.locator('#rc-apply').click();
  await page.click('#groc-view-bought');
  await expect(tax(page)).toHaveValue('2.00');
});

test('the Tax box still sets the store\'s total by hand', async ({ page }) => {
  const sheet = await open(page, 'first');
  await sheet.locator('#rc-apply').click();
  await page.click('#groc-view-bought');
  await tax(page).fill('4.00'); await tax(page).press('Enter');
  await expect(tax(page)).toHaveValue('4.00');
});
