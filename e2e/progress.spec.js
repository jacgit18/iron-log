import { test, expect } from './fixtures.js';

test('a session edited and deleted in the exercise sheet changes just that session', async ({ page }) => {
  // Two check-offs of Hack Squat this week (Day 3 and Day 5 cards) give two sessions.
  await page.locator('#chk-A-d3s1').check();
  await page.locator('#chk-A-d5s3').check();
  await page.locator('#tab-progress').click();
  await page.locator('.pcard', { hasText: 'Hack Squat' }).click();
  const rows = page.locator('table.hist tbody tr');
  await expect(rows).toHaveCount(2);
  await rows.first().getByRole('button', { name: /^Edit entry/ }).click();
  const form = page.getByRole('form', { name: 'Edit session' });
  await form.locator('input[type="number"]').first().fill('300');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toHaveCount(0);
  await expect(rows).toHaveCount(2); // edited in place, not added
  await expect(page.locator('table.hist')).toContainText('300 lb');
  const del = rows.first().getByRole('button', { name: /^Delete entry/ });
  await del.click(); await rows.first().getByRole('button', { name: 'Delete?' }).click();
  await expect(rows).toHaveCount(1);
  await expect(page.locator('table.hist')).not.toContainText('300 lb'); // the edited one went, the other stayed
});
