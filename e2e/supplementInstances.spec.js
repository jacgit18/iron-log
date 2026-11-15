import { test, expect } from '@playwright/test';
import { expectScheduledAt, openSupplementEditor, suppChip } from './nutritionBoardHelpers.js';

// The same supplement twice a day: picking one that is already scheduled adds another instance in the other section, each ticked on its own.
const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const rowBase = { client_updated_at: '2026-01-05T10:00:00Z', version: 1, deleted_at: null };
const pull = { rows: [
  { table: 'list_items', list: 'supplement_item', client_id: 'fishoil', position: 0, data: { id: 'fishoil', n: 'Fish Oil', slot: 'morning', dose: '1 g' }, ...rowBase, seq: '1' },
], cursor: '1', more: false };

async function open(page) {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:session/known', 'true');
  });
  await page.route('**/api/sync*', json(200, pull));
  await page.route('**/api/me', json(200, { ok: true, userId: 'dev-user', account: { kind: 'dev', email: null, name: null } }));
  await page.route('**/api/commands/**', json(200, { rows: [], cursor: '2' }));
  await page.route('**/api/catalog?*', json(200, { ok: true, items: [] }));
  await page.route('**/api/catalog/search?*', json(200, { ok: true, items: [], more: false }));
  await page.goto('/');
  await page.click('#tab-daily'); await page.click('#daily-supplements');
  await openSupplementEditor(page);
}

test('a supplement already in Morning gets a second instance in Night, ticked and removed on its own', async ({ page }) => {
  await open(page);
  await page.click('#suplib-add');
  await page.fill('#suppadd-q', 'fish');
  await page.getByRole('dialog').getByRole('button', { name: /Fish Oil/ }).click();
  await expect(page.getByText('Yours, in Morning. Adding it to another time of day makes another instance.')).toBeVisible();
  await page.getByRole('dialog').getByLabel('Night').check();
  await page.fill('#suppadd-dose', '2 g');
  await page.click('#suppadd-go');
  await expectScheduledAt(page, 'Night', ['Fish Oil2 g']);
  await expectScheduledAt(page, 'Morning', ['Fish Oil1 g']); // still in Morning, with its own dose
  await expect(page.locator('.exlib .exrow')).toHaveCount(1); // one row for both times
  await suppChip(page, 'Fish Oil', 'Night').click(); // turned off from the chip
  await expect(suppChip(page, 'Fish Oil', 'Night')).toHaveAttribute('aria-pressed', 'false');
  await expect(suppChip(page, 'Fish Oil', 'Morning')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.exlib .exrow')).toHaveCount(1); // no second library entry left behind
});
