import { test, expect } from './fixtures.js';
import { photo } from './receiptHelpers.js';

// Receipt back guard (brief receipt-back-guard). The decisions are node tests (receiptDraft.test.ts, backNav.test.ts, forgetDraft.test.ts); this covers the wiring: Back, a tap outside
// and Escape on a receipt with changes ask first and keep the sheet, Keep editing and Discard, an untouched receipt closing on Back, and a closed receipt coming back from
// the Resume row with its edits until Apply or Discard erases it. The scan route is stubbed: no photo leaves the test.
const add = async (page, n) => { await page.fill('#groc-name', n); await page.click('#groc-add'); await expect(page.locator('#groc-name')).toHaveValue(''); };
const setup = async page => {
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-edit');
  await add(page, 'Eggs'); await add(page, 'Olive oil');
  await page.click('#groc-done');
  await page.click('#groc-view-shopping');
  await page.route('**/api/scan/receipt', async route => {
    const { items } = route.request().postDataJSON();
    const id = n => items.find(i => i.n === n)?.id ?? null;
    const result = { kind: 'ok', receipt: { store: "BJ'S", date: '2026-09-24', taxCents: 100, totalCents: 3398, lines: [
      { text: 'EGGS LRG 5 DZ', qty: 2, grossCents: 2698, discountCents: 0, matchId: id('Eggs') },
      { text: 'KS EXTRA VIRGIN OL 2L', qty: 1, grossCents: 1000, discountCents: 400, matchId: id('Olive oil') },
    ] } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result }) });
  });
};
const scan = async page => { await page.getByLabel('Receipt photo').setInputFiles(photo); await expect(page.getByRole('dialog').getByRole('heading', { name: 'Receipt' })).toBeVisible(); };
const prompt = page => page.getByRole('group', { name: 'Leave this receipt?' });
const oil = page => page.getByRole('dialog').getByLabel('Include KS EXTRA VIRGIN OL 2L');

test.beforeEach(async ({ page }) => { await setup(page); });

test('Back on a receipt with a changed line asks first and keeps the sheet; Keep editing returns with the change; Discard erases it', async ({ page }) => {
  await scan(page);
  await oil(page).uncheck();
  await page.goBack();
  await expect(prompt(page)).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(prompt(page)).toHaveCount(0);
  await expect(oil(page)).not.toBeChecked();
  await page.goBack(); // the guard put the sheet's entry back, so the next Back asks again
  await expect(prompt(page)).toBeVisible();
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#groc-resume')).toHaveCount(0);
  await expect(page.locator('#groc-summary')).toContainText('Bought 0 of 2');
});

test('Back on an untouched receipt closes it, and the Resume row brings it back', async ({ page }) => {
  await scan(page);
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#groc-resume')).toContainText(/BJ'S, 2 lines, closed/);
  await page.click('#groc-resume-go');
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Receipt' })).toBeVisible();
  await expect(page.locator('#groc-resume')).toHaveCount(0); // hidden while the sheet is open
});

test('Close keeps a draft with its edits; Resume restores them; Apply erases the draft', async ({ page }) => {
  await scan(page);
  await oil(page).uncheck();
  await page.getByRole('button', { name: 'Close' }).click(); // Close is deliberate: it does not ask, it keeps a draft
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.click('#groc-resume-go');
  await expect(oil(page)).not.toBeChecked();
  await oil(page).check(); // the lines match the receipt total again, so Apply is not armed
  await page.getByRole('dialog').getByRole('button', { name: /^Apply/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#groc-resume')).toHaveCount(0);
});

test('Discard on the Resume row erases the draft', async ({ page }) => {
  await scan(page);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.click('#groc-resume-discard');
  await expect(page.locator('#groc-resume')).toHaveCount(0);
  await expect(page.evaluate(() => sessionStorage.getItem('ironlog.receiptDraft'))).resolves.toBeNull();
});

test('a tap outside the sheet and Escape ask first when the receipt was changed, and close an untouched one', async ({ page }) => {
  await scan(page);
  await oil(page).uncheck();
  await page.locator('.scrim').click({ position: { x: 4, y: 4 } });
  await expect(prompt(page)).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.keyboard.press('Escape');
  await expect(prompt(page)).toBeVisible();
  await page.getByRole('button', { name: 'Discard' }).click();
  await scan(page);
  await page.locator('.scrim').click({ position: { x: 4, y: 4 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a draft older than 2 hours is not offered', async ({ page }) => {
  await scan(page);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#groc-resume')).toHaveCount(1);
  await page.evaluate(() => { const k = 'ironlog.receiptDraft'; const d = JSON.parse(sessionStorage.getItem(k)); d.savedAt -= 3 * 3600 * 1000; sessionStorage.setItem(k, JSON.stringify(d)); });
  await page.reload();
  await expect(page.locator('#groc-scan')).toBeVisible();
  await expect(page.locator('#groc-resume')).toHaveCount(0);
});
