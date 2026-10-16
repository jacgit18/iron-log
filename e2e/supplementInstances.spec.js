import { test, expect } from '@playwright/test';

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
  await page.click('#sched-edit');
}

test('a supplement already in Morning gets a second instance in Night, ticked and removed on its own', async ({ page }) => {
  await open(page);
  const night = page.getByRole('group', { name: 'Night' });
  const morning = page.getByRole('group', { name: 'Morning' });
  await page.getByRole('combobox', { name: 'Add to Night' }).fill('fish');
  await page.getByRole('group', { name: 'Yours' }).getByRole('option', { name: /Fish Oil/ }).click();
  await expect(page.getByText('Adds another Fish Oil to Night, so you can take it more than once a day.')).toBeVisible();
  await page.fill('#suppdose-night', '2 g');
  await page.click('#suppadd-night');
  await expect(night.locator('.srow')).toContainText(['Fish Oil2 g']);
  await expect(morning.locator('.srow')).toContainText(['Fish Oil1 g']); // still in Morning
  await night.getByRole('checkbox').check();
  await expect(morning.getByRole('checkbox')).not.toBeChecked();
  await night.getByRole('button', { name: 'Take Fish Oil off Night' }).click();
  await night.getByRole('button', { name: 'Tap again to remove' }).click();
  await expect(night.locator('.srow')).toHaveCount(0);
  await expect(morning.locator('.srow')).toHaveCount(1);
  await expect(page.locator('.exlib .exrow')).toHaveCount(1); // no second library entry left behind
});
