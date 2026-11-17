import { test, expect } from './fixtures.js';
import { photo } from './receiptHelpers.js';

// Scan receipt (brief receipt-scan). The validator, the plan, the total check and the route are node tests (receipt.test.ts, groceryReceipt.test.ts, server/scan.test.ts,
// server/scanBody.test.ts); this covers the wiring a unit test cannot: the button only for an admin, the sheet drawn from an answer, a changed match and an unticked
// line changing what Apply does, Apply ticking items with prices and Undo putting them back, and a failure leaving the list alone. The route is stubbed: no photo leaves the test.
const asAdmin = page => page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true'));
const add = async (page, n) => { await page.fill('#groc-name', n); await page.click('#groc-add'); await expect(page.locator('#groc-name')).toHaveValue(''); };
const setup = async page => {
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-edit');
  await add(page, 'Eggs'); await add(page, 'Olive oil'); await add(page, 'Rice');
  await page.click('#groc-done');
  await page.click('#groc-view-shopping');
};
// The answer is built from the item ids the app sent, so the test needs no ids of its own.
const answer = (page, build) => page.route('**/api/scan/receipt', async route => {
  const { items } = route.request().postDataJSON();
  const id = n => items.find(i => i.n === n)?.id ?? null;
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: build(id) }) });
});
const good = id => ({ kind: 'ok', receipt: { store: "BJ'S", date: '2026-09-24', taxCents: 100, totalCents: 4198, lines: [
  { text: 'EGGS LRG 5 DZ', qty: 2, grossCents: 2698, discountCents: 0, matchId: id('Eggs') },
  { text: 'KS EXTRA VIRGIN OL 2L', qty: 1, grossCents: 1000, discountCents: 400, matchId: id('Olive oil') },
  { text: 'ZEVIA SODA 12PK', qty: 1, grossCents: 800, discountCents: 0, matchId: null },
] } });

test('a person who is not an admin sees the Scan receipt button (open to everyone since 2026-11-08)', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#groc-scan')).toHaveCount(1);
});

test.describe('as an admin', () => {
  test.beforeEach(async ({ page }) => { await asAdmin(page); await page.reload(); await setup(page); });

  test('the sheet shows each line with its match and net price, a changed match and an unticked line change Apply, Apply ticks the items with prices, and Undo puts them back', async ({ page }) => {
    await answer(page, good);
    await page.getByLabel('Receipt photo').setInputFiles(photo);
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'Receipt' })).toBeVisible();
    await expect(sheet.getByText('Total check: lines plus tax match the receipt.')).toBeVisible();
    await sheet.getByLabel('Add this store to your stores').uncheck(); // brief receipt-add-store: this test is about the lines, not a new store
    await expect(sheet.getByLabel('Item for EGGS LRG 5 DZ')).toHaveValue(/.+/);
    await expect(sheet.getByLabel('Item for ZEVIA SODA 12PK')).toHaveValue('');
    await expect(sheet.getByLabel('Include ZEVIA SODA 12PK')).toBeDisabled();
    await expect(sheet.getByText('$6.00')).toBeVisible(); // 10.00 less 4.00 instant savings
    await expect(sheet.getByRole('button', { name: 'Apply 2 items' })).toBeEnabled();
    await sheet.getByLabel('Include KS EXTRA VIRGIN OL 2L').uncheck();
    await expect(sheet.getByRole('button', { name: 'Apply 1 item' })).toBeEnabled();
    await sheet.getByLabel('Include KS EXTRA VIRGIN OL 2L').check();
    await sheet.getByLabel('Item for ZEVIA SODA 12PK').selectOption({ label: 'Rice' });
    await expect(sheet.getByRole('button', { name: 'Apply 3 items' })).toBeEnabled();
    await sheet.getByLabel('Item for ZEVIA SODA 12PK').selectOption({ label: 'Not on your list' });
    await expect(page.locator('#groc-summary')).toContainText('Bought 0 of 3'); // nothing is written before Apply
    await sheet.getByRole('button', { name: 'Apply 2 items' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#groc-summary')).toContainText('Bought 2 of 3');
    await expect(page.locator('#groc-summary')).toContainText('Spent $32.98'); // 26.98 + 6.00; "BJ'S" is not a store on this list, so no tax is set
    await expect(page.getByText('Applied 2 items for September 2026.')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#groc-summary')).toContainText('Bought 0 of 3');
  });

  test('Cancel changes nothing, and a receipt dated another month says so', async ({ page }) => {
    await answer(page, id => { const r = good(id); r.receipt.date = '2026-08-30'; return r; });
    await page.getByLabel('Receipt photo').setInputFiles(photo);
    await expect(page.getByRole('status').filter({ hasText: 'dated August 2026' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#groc-summary')).toContainText('Bought 0 of 3');
  });

  test('an unreadable photo and a failed call say so and leave the list alone', async ({ page }) => {
    await page.route('**/api/scan/receipt', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { kind: 'unreadable' } }) }));
    await page.getByLabel('Receipt photo').setInputFiles(photo);
    await expect(page.getByRole('status').filter({ hasText: 'Could not read that receipt' })).toBeVisible();
    await page.unroute('**/api/scan/receipt');
    await page.route('**/api/scan/receipt', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, why: 'upstream' }) }));
    await page.getByLabel('Receipt photo').setInputFiles(photo);
    await expect(page.getByRole('status').filter({ hasText: 'Scan is not available right now' })).toBeVisible();
    await page.unroute('**/api/scan/receipt');
    await page.route('**/api/scan/receipt', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, why: 'cap' }) }));
    await page.getByLabel('Receipt photo').setInputFiles(photo);
    await expect(page.getByRole('status').filter({ hasText: 'used today' })).toBeVisible(); // the cap is not shown as an outage
    await expect(page.locator('#groc-summary')).toContainText('Bought 0 of 3');
  });

  test('Scan receipt opens a chooser with Camera and Photos, on a phone and on a desktop (brief receipt-pick-photo)', async ({ page }) => {
    await expect(page.getByLabel('Receipt camera')).toHaveAttribute('capture', 'environment');
    await expect(page.getByLabel('Receipt photo')).not.toHaveAttribute('capture');
    for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(size);
      await expect(page.locator('#groc-scan-pick')).toBeHidden(); // shut until Scan receipt is pressed
      await expect(page.locator('#groc-scan')).not.toHaveAttribute('aria-controls'); // nothing to point at while shut
      await page.click('#groc-scan');
      await expect(page.locator('#groc-scan')).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#groc-scan')).toHaveAttribute('aria-controls', 'groc-scan-choose');
      await expect(page.locator('#groc-scan-camera')).toBeVisible();
      await expect(page.locator('#groc-scan-pick')).toBeVisible();
      for (const id of ['#groc-scan-camera', '#groc-scan-pick']) expect(Math.round((await page.locator(id).boundingBox()).height)).toBe(48);
      await page.keyboard.press('Escape');
      await expect(page.locator('#groc-scan-pick')).toBeHidden();
      await expect(page.locator('#groc-scan')).toBeFocused();
    }
  });

  test('Photos opens the library picker, and the chooser closes with focus back on Scan receipt', async ({ page }) => {
    await answer(page, good);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#groc-scan');
    const chooser = page.waitForEvent('filechooser');
    await page.click('#groc-scan-pick');
    await (await chooser).setFiles(photo);
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Receipt' })).toBeVisible();
    await expect(page.locator('#groc-scan-choose')).toHaveCount(0);
  });

  test('Camera opens the camera input and sends the photo, and focus is back on Scan receipt', async ({ page }) => {
    await answer(page, good);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#groc-scan');
    const chooser = page.waitForEvent('filechooser');
    await page.click('#groc-scan-camera');
    await (await chooser).setFiles(photo);
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Receipt' })).toBeVisible();
    await expect(page.locator('#groc-scan-choose')).toHaveCount(0);
  });

  test('a second press of Scan receipt, a tap elsewhere, Tab out and the Escape key (which does not also reach App) close the chooser', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const shut = () => expect(page.locator('#groc-scan-choose')).toHaveCount(0);
    await page.click('#groc-scan'); await expect(page.locator('#groc-scan-choose')).toBeVisible();
    await page.click('#groc-scan'); await shut();
    await page.click('#groc-scan'); await page.click('#groc-toolmore'); await shut(); // More on a phone
    await page.click('#groc-toolmore'); // close More again
    await page.click('#groc-scan'); await page.mouse.click(5, 300); await shut(); // a tap on empty page
    await page.click('#groc-scan'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await shut(); // focus leaves the row
    await page.click('#groc-scan');
    await page.evaluate(() => { window.__esc = 0; document.addEventListener('keydown', e => { if (e.key === 'Escape') window.__esc++; }); });
    await page.keyboard.press('Escape'); await shut();
    expect(await page.evaluate(() => window.__esc)).toBe(0);
  });

  test('while a scan runs the chooser is shut and Scan receipt reads Reading receipt...', async ({ page }) => {
    let release = () => {};
    const gate = new Promise(r => { release = r; });
    await page.route('**/api/scan/receipt', async route => { await gate; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { kind: 'unreadable' } }) }); });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#groc-scan');
    const chooser = page.waitForEvent('filechooser');
    await page.click('#groc-scan-pick');
    await (await chooser).setFiles(photo);
    await expect(page.locator('#groc-scan')).toHaveText('Reading receipt...');
    await expect(page.locator('#groc-scan')).toBeDisabled();
    await expect(page.locator('#groc-scan-choose')).toHaveCount(0);
    release();
    await expect(page.locator('#groc-scan')).toHaveText('Scan receipt');
    await expect(page.locator('#groc-scan-choose')).toHaveCount(0); // it does not reopen by itself
  });
});
