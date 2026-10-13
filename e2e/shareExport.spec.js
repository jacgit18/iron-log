import { test, expect } from './fixtures.js';

// The Share buttons are admin-only (features.ts) and appear only where the browser can share files. The browser here cannot, so each
// test stubs navigator.share / canShare before the app starts, and records what was shared.
const stub = (page, { share }) => page.addInitScript(({ mode }) => {
  window.__shared = [];
  navigator.canShare = d => !!(d && d.files && d.files.length);
  navigator.share = async d => {
    window.__shared.push({ name: d.files[0].name, type: d.files[0].type, size: d.files[0].size });
    if (mode === 'cancel') throw new DOMException('cancelled', 'AbortError');
    if (mode === 'fail') throw new DOMException('nope', 'DataError');
    if (mode === 'gesture' && window.__shared.length === 1) throw new DOMException('no tap', 'NotAllowedError');
  };
}, { mode: share });
const asAdmin = async page => { await page.evaluate(() => localStorage.setItem('ironlog:session/admin', 'true')); await page.reload(); };
const openSettings = async page => { await page.click('#tab-settings'); await expect(page.getByRole('heading', { name: 'Export & import' })).toBeVisible(); };

test('without file sharing support there is no Share button, even for an admin', async ({ page }) => {
  await asAdmin(page); await openSettings(page);
  await expect(page.getByRole('button', { name: 'Export all data', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Share/ })).toHaveCount(0);
});

test('a person who is not an admin does not see Share even where the browser can share files', async ({ page }) => {
  await stub(page, { share: 'ok' }); await page.reload(); await openSettings(page);
  await expect(page.getByRole('button', { name: /^Share/ })).toHaveCount(0);
});

test('Share sends the file the download would make, and says Shared', async ({ page }) => {
  await stub(page, { share: 'ok' }); await asAdmin(page); await openSettings(page);
  await page.getByRole('button', { name: 'Share data file' }).click();
  await expect(page.getByText('Shared', { exact: true })).toBeVisible();
  const sent = await page.evaluate(() => window.__shared);
  expect(sent).toHaveLength(1);
  expect(sent[0].name).toBe('iron-log-data-2026-09-24.json');
  expect(sent[0].type).toBe('application/json');
  expect(sent[0].size).toBeGreaterThan(100);
  // The download of the same button group builds the same name.
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all data', exact: true }).click();
  expect((await dl).suggestedFilename()).toBe(sent[0].name);
  await page.getByRole('button', { name: 'Share Excel' }).click();
  await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(2);
  expect((await page.evaluate(() => window.__shared))[1].name).toBe('iron-log-2026-09-24.xlsx');
});

test('closing the share sheet is not an error: nothing is shown and nothing is downloaded', async ({ page }) => {
  await stub(page, { share: 'cancel' }); await asAdmin(page); await openSettings(page);
  let downloaded = false; page.on('download', () => { downloaded = true; });
  await page.getByRole('button', { name: 'Share data file' }).click();
  await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
  await expect(page.getByRole('button', { name: 'Share data file' })).toBeEnabled();
  await expect(page.locator('.flag, [role="status"]').filter({ hasText: /Shared|Couldn/ })).toHaveCount(0);
  expect(downloaded).toBe(false);
});

test('a share that fails falls back to the normal download with a short message', async ({ page }) => {
  await stub(page, { share: 'fail' }); await asAdmin(page); await openSettings(page);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Share data file' }).click();
  expect((await dl).suggestedFilename()).toBe('iron-log-data-2026-09-24.json');
  await expect(page.getByText(/downloaded instead/)).toBeVisible();
});

test('when the tap ran out, a second tap shares the already built file', async ({ page }) => {
  await stub(page, { share: 'gesture' }); await asAdmin(page); await openSettings(page);
  await page.getByRole('button', { name: 'Share data file' }).click();
  const again = page.getByRole('button', { name: /^Share iron-log-data-2026-09-24\.json$/ });
  await again.click();
  await expect(page.getByText('Shared', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__shared.map(s => s.name))).toEqual(['iron-log-data-2026-09-24.json', 'iron-log-data-2026-09-24.json']);
});

test('the import picker lists every import type by extension and media type', async ({ page }) => {
  await openSettings(page);
  const accept = await page.locator('#imp-file').getAttribute('accept');
  for (const t of ['.json', 'application/json', '.csv', 'text/csv', '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) expect(accept.split(',')).toContain(t);
});

test('choosing the same file twice opens the review both times', async ({ page }) => {
  await openSettings(page);
  const file = { name: 'iron-log-data.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'iron-log', format: 1, config: {}, logs: {}, weeks: {} })) };
  for (let i = 0; i < 2; i++) {
    await page.locator('#imp-file').setInputFiles(file);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('a file that is far too big gets an error message, not a hang', async ({ page }) => {
  await openSettings(page);
  await page.locator('#imp-file').setInputFiles({ name: 'big.json', mimeType: 'application/json', buffer: Buffer.alloc(26 * 1024 * 1024, 32) });
  await expect(page.locator('#imp-err')).toContainText('too big');
});
