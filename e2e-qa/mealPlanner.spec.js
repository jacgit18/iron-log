import { expect, test } from '@playwright/test';
import { signInAs } from './persona.js';

// QA scenarios S-08 and S-09 (Meal planner): Log on today's planned items logs them and a later day has no Log button; the grocery button adds each
// missing ingredient once and a second press adds nothing.
const open = async page => { await page.click('#tab-daily'); await page.click('#daily-supplements'); };

test('S-08: Log on today\'s planned items logs them, and a later day has no Log button', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'meal-planner');
  await open(page);
  const diet = page.getByRole('region', { name: 'Diet' });
  const plan = diet.locator('.dt-plan');
  await expect(plan).toBeVisible({ timeout: 30_000 });
  const logs = plan.getByRole('button', { name: /^Log / });
  const n = await logs.count();
  expect(n).toBeGreaterThan(0); // today has at least one planned recipe or saved meal
  const before = await diet.locator('.dt-entry').count();
  for (let i = 0; i < n; i++) { // the Log buttons stay on their rows, so press each row's own button once and check its message by name
    const btn = logs.nth(i);
    const name = (await btn.getAttribute('aria-label')).replace(/^Log /, '');
    await btn.click();
    await expect(plan.getByRole('status')).toHaveText(new RegExp(`^Logged \\d+ from ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`));
  }
  expect(await diet.locator('.dt-entry').count()).toBeGreaterThan(before);
  await plan.getByRole('list', { name: 'Plan', exact: true }).getByRole('button').nth(1).click(); // the day after today
  await expect(plan.getByRole('button', { name: /^Log / })).toHaveCount(0);
  await context.close();
});

test('S-09: the plan\'s grocery button adds each missing ingredient once, and a second press adds nothing', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'meal-planner');
  await open(page);
  const plan = page.getByRole('region', { name: 'Diet' }).locator('.dt-plan');
  const button = plan.getByRole('button', { name: 'Add missing ingredients to Shopping' });
  const rows = async () => { await page.click('#daily-grocery'); const n = await page.locator('.gget').count(); await page.click('#daily-supplements'); return n; };
  await expect(button).toBeVisible({ timeout: 30_000 });
  const before = await rows();
  await button.click();
  await expect(plan.getByRole('status')).toContainText(/Added \d+/);
  const added = Number((await plan.getByRole('status').innerText()).match(/Added (\d+)/)[1]);
  expect(added).toBeGreaterThan(0);
  expect(await rows()).toBe(before + added);
  await button.click();
  await expect(plan.getByRole('status')).toContainText(/\d+ (is|are) on Shopping already\./);
  expect(await rows()).toBe(before + added);
  await context.close();
});
