import { test, expect } from './fixtures.js';

// Settings → Injury prevention: on shows the Back-to-back suggestion (and the move Heads-up). Off is the default: a new account starts with
// it off, and an account from before the change was given On by `npm run keep:injury-prevention`.
const DAY2 = ['A-d2s1', 'A-d2s2-0', 'A-d2s3', 'A-d2s4', 'A-d2s5-0', 'A-d2s5-1', 'A-d2s6-0', 'A-d2s6-1'];
const tick = async page => { for (const id of DAY2) await page.locator(`#chk-${id}`).check(); };
const untick = async page => { for (const id of DAY2) await page.locator(`#chk-${id}`).uncheck(); };
const toggle = page => page.getByRole('switch', { name: 'Injury prevention' });
const setSwitch = async (page, on) => {
  await page.locator('#tab-settings').click();
  await (on ? toggle(page).check() : toggle(page).uncheck());
  await page.locator('#tab-board').click();
};

test('off by default: finishing a day suggests nothing; turning it on brings suggestions, and off drops one showing', async ({ page }) => {
  const note = page.getByRole('status').filter({ hasText: 'Back-to-back' });
  await page.locator('#tab-settings').click();
  await expect(toggle(page)).not.toBeChecked(); // off by default
  await page.locator('#tab-board').click();
  await tick(page);
  await expect(page.locator('#col-3 #chk-A-d3s5')).toHaveCount(1); // Day 2 is finished (the repeat is still there)
  await expect(note).toHaveCount(0);

  await setSwitch(page, true);
  await untick(page);
  await tick(page);
  await expect(note).toBeVisible();

  await setSwitch(page, false);
  await expect(note).toHaveCount(0); // the pending suggestion went with the switch
  await untick(page);
  await tick(page);
  await expect(note).toHaveCount(0);
});

test('the Board has its own Injury prevention switch, and it agrees with Settings', async ({ page }) => {
  const onBoard = page.locator('.boardroot').getByRole('switch', { name: /Injury prevention/ });
  await expect(onBoard).not.toBeChecked();
  await onBoard.check();
  await page.locator('#tab-settings').click();
  await expect(toggle(page)).toBeChecked();
  await toggle(page).uncheck();
  await page.locator('#tab-board').click();
  await expect(onBoard).not.toBeChecked();
});
