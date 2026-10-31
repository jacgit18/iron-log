import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

// Each view is reached by clicking these in order.
for (const [name, clicks] of [
  ['workout', []], ['stretches', ['#board-stretches']], ['supplements', ['#tab-daily', '#daily-supplements']],
  ['progress', ['#tab-progress']],
  ['training trends', ['#tab-progress', 'button.hubtile:has-text("Training trends")']],
  ['frequency goals', ['#tab-progress', 'button.hubtile:has-text("Frequency goals")']], ['weight goals', ['#tab-progress', 'text=Manage goals']],
  ['exercise charts', ['#tab-progress', 'text=Exercise charts']], ['program editor', ['#tab-program']],
]) {
  test(`${name} has no accessibility violations`, async ({ page }) => {
    for (const c of clicks) { await page.click(c); await page.waitForTimeout(300); }
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  });
}

test('stretch library has no accessibility violations', async ({ page }) => {
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Stretch library' }).click();
  const { violations } = await scan(page);
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
});

test('ticking a stretch and logging water both stick', async ({ page }) => {
  await page.click('#board-stretches');
  await page.locator('#sday-4').check();
  await expect(page.locator('#sday-4')).toBeChecked();
  await page.click('#tab-daily');
  await page.click('#daily-supplements');
  await page.click('#water-16\\.9');
  await expect(page.getByRole('status').filter({ hasText: '16.9' }).first()).toBeVisible();
});

test('training minutes for the water goal are kept after leaving the box and shown again after a reload', async ({ page }) => {
  await page.click('#tab-daily');
  await page.click('#daily-supplements');
  await page.fill('#water-train', '45');
  await page.locator('#water-hot').focus();
  await expect(page.locator('#water-train')).toHaveValue('45');
  await page.reload();
  await page.click('#tab-daily');
  await page.click('#daily-supplements');
  await expect(page.locator('#water-train')).toHaveValue('45');
});

test('supplement library has no accessibility violations', async ({ page }) => {
  await page.click('#tab-daily');
  await page.click('#daily-supplements');
  await page.click('#sched-edit'); // the library shows under the schedule while editing
  await page.click('#suplib-new');
  await page.fill('#supp-name', 'Vitamin D3');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.exlib .exrow b', { hasText: 'Vitamin D3' })).toBeVisible();
  const { violations } = await scan(page);
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  await page.click('#sched-edit'); // Done: the schedule alone, with it to tick
  await expect(page.getByRole('checkbox', { name: 'Vitamin D3' })).toBeVisible();
});
