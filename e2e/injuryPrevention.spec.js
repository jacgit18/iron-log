import { test, expect } from './fixtures.js';

// Settings → Injury prevention: off hides the Back-to-back suggestion (and the move Heads-up); on is the default.
const DAY2 = ['A-d2s1', 'A-d2s2-0', 'A-d2s3', 'A-d2s4', 'A-d2s5-0', 'A-d2s5-1', 'A-d2s6-0', 'A-d2s6-1'];
const tick = async page => { for (const id of DAY2) await page.locator(`#chk-${id}`).check(); };
const toggle = page => page.getByRole('switch', { name: /On|Off/ });

test('turning injury prevention off drops a suggestion and stops new ones; on brings them back', async ({ page }) => {
  await tick(page);
  const note = page.getByRole('status').filter({ hasText: 'Back-to-back' });
  await expect(note).toBeVisible();
  await page.locator('#tab-settings').click();
  await expect(toggle(page)).toBeChecked(); // on by default
  await toggle(page).uncheck();
  await page.locator('#tab-board').click();
  await expect(note).toHaveCount(0); // the pending suggestion went with the switch
  for (const id of DAY2) await page.locator(`#chk-${id}`).uncheck();
  await tick(page);
  await expect(note).toHaveCount(0);
  await page.locator('#tab-settings').click();
  await toggle(page).check();
  await page.locator('#tab-board').click();
  for (const id of DAY2) await page.locator(`#chk-${id}`).uncheck();
  await tick(page);
  await expect(note).toBeVisible();
});
