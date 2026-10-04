import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

for (const [name, tab] of [['board', null], ['stretches', '#tab-stretches'], ['supplements', '#tab-supplements'], ['progress', '#tab-progress'], ['program editor', '#tab-program'], ['body', '#tab-body']]) {
  test(`${name} has no accessibility violations`, async ({ page }) => {
    if (tab) { await page.click(tab); await page.waitForTimeout(300); }
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
  await page.click('#tab-stretches');
  await page.locator('#sday-4').check();
  await expect(page.locator('#sday-4')).toBeChecked();
  await page.click('#tab-supplements');
  await page.click('#water-16\\.9');
  await expect(page.getByRole('status').filter({ hasText: '16.9' }).first()).toBeVisible();
});

test('supplement library has no accessibility violations', async ({ page }) => {
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Supplement library' }).click();
  await page.click('#suplib-new');
  await page.fill('#supp-name', 'Vitamin D3');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Vitamin D3')).toBeVisible();
  const { violations } = await scan(page);
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  await page.click('#tab-supplements');
  await expect(page.getByLabel('Vitamin D3')).toBeVisible();
});
