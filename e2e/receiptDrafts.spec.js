import { test, expect } from './fixtures.js';
import { photo } from './receiptHelpers.js';

// Receipt drafts list (brief receipt-drafts-list). The decisions (7 days, five at most, the oldest dropping, untrusted storage, relinking, the old session draft, the wipes) are node tests
// (receiptDraft.test.ts, receiptDraftRow.test.ts, forgetDraft.test.ts); this covers the wiring: Save for later, the rows surviving a reload, two receipts as two rows with Resume and Apply
// touching only their own, a draft whose item is gone, and the old session draft moved in. The scan route is stubbed: no photo leaves the test.
const add = async (page, n) => { await page.fill('#groc-name', n); await page.click('#groc-add'); await expect(page.locator('#groc-name')).toHaveValue(''); };
const STORES = ["BJ'S", 'ALDI'];
const setup = async page => {
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-edit');
  await add(page, 'Eggs'); await add(page, 'Olive oil');
  await page.click('#groc-done');
  await page.click('#groc-view-shopping');
  let n = 0;
  await page.route('**/api/scan/receipt', async route => {
    const { items } = route.request().postDataJSON();
    const id = name => items.find(i => i.n === name)?.id ?? null;
    const result = { kind: 'ok', receipt: { store: STORES[n++ % 2], date: '2026-09-24', taxCents: 100, totalCents: 3398, lines: [
      { text: 'EGGS LRG 5 DZ', qty: 2, grossCents: 2698, discountCents: 0, matchId: id('Eggs') },
      { text: 'KS EXTRA VIRGIN OL 2L', qty: 1, grossCents: 1000, discountCents: 400, matchId: id('Olive oil') },
    ] } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result }) });
  });
};
const scan = async page => { await page.getByLabel('Receipt photo').setInputFiles(photo); await expect(page.getByRole('dialog').getByRole('heading', { name: 'Receipt' })).toBeVisible(); };
const oil = page => page.getByRole('dialog').getByLabel('Include KS EXTRA VIRGIN OL 2L');
const rows = page => page.locator('#groc-resume .rcresume');

test.beforeEach(async ({ page }) => { await setup(page); });

test('Save for later closes with no prompt, the row survives a reload, and Resume brings the edits back', async ({ page }) => {
  await scan(page);
  await oil(page).uncheck();
  await page.getByRole('button', { name: 'Save for later' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Leave this receipt?' })).toHaveCount(0);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(/BJ'S, Sep 24.*2 lines.*\$33\.98.*saved just now/);
  await page.reload();
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole('button', { name: "Resume BJ'S, Sep 24" }).click();
  await expect(oil(page)).not.toBeChecked();
});

test('two left receipts are two rows; Resume opens its own and Apply removes only that one', async ({ page }) => {
  await scan(page); await page.getByRole('button', { name: 'Close' }).click();
  await scan(page); await page.getByRole('button', { name: 'Close' }).click();
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Resume ALDI, Sep 24' }).click();
  await expect(page.getByRole('dialog')).toContainText('ALDI');
  await page.getByRole('dialog').getByRole('button', { name: /^Apply/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("BJ'S");
  await page.getByRole('button', { name: "Discard BJ'S, Sep 24" }).click();
  await expect(page.locator('#groc-resume')).toHaveCount(0);
});

test('a draft whose item was deleted since resumes with that line on no match, and says so', async ({ page }) => {
  await scan(page);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.evaluate(() => { const k = 'ironlog.receiptDrafts'; const l = JSON.parse(localStorage.getItem(k)); l[0].restore.choices[1] = { itemId: 'gone-item', include: true }; localStorage.setItem(k, JSON.stringify(l)); });
  await page.reload();
  await page.getByRole('button', { name: /^Resume / }).click();
  await expect(page.getByRole('dialog')).toContainText('no longer on your list');
  await expect(oil(page)).not.toBeChecked();
  await expect(page.getByRole('dialog').getByLabel('Item for KS EXTRA VIRGIN OL 2L')).toHaveValue('');
});

test('the old one-receipt draft in sessionStorage is moved into the list once', async ({ page }) => {
  await page.evaluate(() => sessionStorage.setItem('ironlog.receiptDraft', JSON.stringify({ savedAt: Date.now() - 600000, mk: '2026-09', receipt: { store: 'COSTCO', date: '2026-09-23', lines: [{ text: 'MILK', qty: 1, grossCents: 500, discountCents: 0, matchId: null }] }, restore: null })));
  await page.reload();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('COSTCO, Sep 23');
  await expect(page.evaluate(() => sessionStorage.getItem('ironlog.receiptDraft'))).resolves.toBeNull();
});
