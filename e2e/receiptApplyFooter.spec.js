import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { photo } from './receiptHelpers.js';

// Receipt sheet: Apply footer (brief receipt-apply-footer). The label and armed-state rules are node tests (receiptApplyLabel.test.ts); this covers the wiring: Close in the header
// that never applies, one wide Apply with a summary, the two-tap Apply on a mismatch (and moving away disarming it), the last row clearing the bar at 390 px, and 44 px row links.
// The route is stubbed: no photo leaves the test.
const asAdmin = page => page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true'));
const add = async (page, n) => { await page.fill('#groc-name', n); await page.click('#groc-add'); await expect(page.locator('#groc-name')).toHaveValue(''); };
const setup = async page => {
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-edit');
  await add(page, 'Eggs'); await add(page, 'Rice');
  await page.click('#groc-done');
  await page.click('#groc-view-shopping');
};
// The check counts every line, matched or not: 2698 + 349 + 800 = 3847 with no tax matches; a total of 4647 does not.
const scan = (page, totalCents) => page.route('**/api/scan/receipt', async route => {
  const { items } = route.request().postDataJSON();
  const id = n => items.find(i => i.n === n)?.id ?? null;
  const receipt = { store: "BJ'S", date: '2026-09-24', taxCents: 0, totalCents, lines: [
    { text: 'EGGS LRG 5 DZ', qty: 2, grossCents: 2698, discountCents: 0, matchId: id('Eggs') },
    { text: 'RICE 10LB', qty: 1, grossCents: 349, discountCents: 0, matchId: id('Rice') },
    { text: 'ZEVIA SODA 12PK', qty: 1, grossCents: 800, discountCents: 0, matchId: null },
  ] };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { kind: 'ok', receipt } }) });
});
const open = async (page, totalCents) => {
  await scan(page, totalCents);
  await page.getByLabel('Receipt photo').setInputFiles(photo);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Receipt' })).toBeVisible();
  return sheet;
};

test.beforeEach(async ({ page }) => { await asAdmin(page); await page.reload(); await setup(page); });

test('Close is in the header and never applies; the bottom bar has no Cancel', async ({ page }) => {
  const sheet = await open(page, 3847);
  await expect(sheet.locator('.rctop').getByRole('button', { name: 'Close' })).toBeVisible();
  await expect(sheet.locator('.rcfoot').getByRole('button')).toHaveCount(1);
  await expect(sheet.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await sheet.locator('#rc-cancel').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#groc-summary')).toContainText('Bought 0 of 2');
});

test('the bar shows a summary and one wide Apply that names the items and total; a matching receipt needs one tap', async ({ page }) => {
  const sheet = await open(page, 3847);
  const apply = sheet.locator('#rc-apply');
  await expect(sheet.locator('.rcsum')).toHaveText('2 items, $30.47.');
  await expect(apply).toHaveText('Apply 2 items, $30.47');
  const w = await apply.evaluate(el => [el.getBoundingClientRect().width, el.closest('.rcfoot').getBoundingClientRect().width]);
  expect(w[0]).toBeGreaterThan(w[1] - 2);
  await apply.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Applied 2 items' })).toBeVisible();
  await expect(page.locator('#groc-summary')).toContainText('Bought 2 of 2');
});

test('a mismatch asks twice, and moving away disarms it', async ({ page }) => {
  const sheet = await open(page, 4647);
  const apply = sheet.locator('#rc-apply');
  await expect(sheet.locator('.rcsum')).toContainText('do not match the receipt total');
  await expect(apply).toHaveText('Apply anyway');
  await apply.click();
  await expect(apply).toHaveText('Tap again to apply anyway');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await sheet.locator('#rc-cancel').focus();
  await expect(apply).toHaveText('Apply anyway');
  await apply.click();
  await apply.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#groc-summary')).toContainText('Bought 2 of 2');
});

test('the sheet has no accessibility violations in both themes, with Apply armed', async ({ page }) => {
  const sheet = await open(page, 4647);
  await sheet.locator('#rc-apply').click();
  await expect(sheet.locator('#rc-apply')).toHaveText('Tap again to apply anyway');
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('scrolled to the end, the last row clears the bar; the row links are 44 px tall and keep their names', async ({ page }) => {
    const sheet = await open(page, 3847);
    const add = sheet.getByRole('button', { name: 'Add to list: ZEVIA SODA 12PK' });
    await expect(add).toHaveText('Add to list');
    expect((await add.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await add.click();
    await sheet.locator('#rc-new-add').click();
    const remove = sheet.getByRole('button', { name: 'Remove new item for ZEVIA SODA 12PK' });
    await expect(remove).toHaveText('Remove');
    expect((await remove.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await sheet.locator('#rc-apply').scrollIntoViewIfNeeded();
    await sheet.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const gap = await sheet.evaluate(el => {
      const rows = el.querySelectorAll('.rcrow'), bar = el.querySelector('.rcfoot');
      return bar.getBoundingClientRect().top - rows[rows.length - 1].getBoundingClientRect().bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(0);
  });
});
