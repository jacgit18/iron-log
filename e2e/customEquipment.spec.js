import { test, expect } from './fixtures.js';

// Adding your own equipment from an Equipment menu, using it, and removing it from the Exercise library.
test('add equipment in a menu, use it on an exercise, then remove it', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Exercise library', exact: true }).click();
  const lib = page.locator('.exlib');
  await lib.getByRole('button', { name: '+ New exercise' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Name').fill('Landmine Press');
  await dlg.getByRole('combobox', { name: 'Equipment' }).selectOption({ label: 'Add equipment…' });
  await dlg.getByLabel('New equipment').fill('Landmine');
  await dlg.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dlg.getByRole('combobox', { name: 'Equipment' })).toHaveValue('x:landmine');
  await dlg.getByRole('button', { name: /^Save/ }).click();

  await expect(lib.getByText('Landmine Press')).toBeVisible();
  await expect(lib.getByText(/Landmine · /).first()).toBeVisible();
  await expect(lib.getByRole('combobox', { name: 'Equipment' }).locator('option', { hasText: 'Landmine' })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  // In use: Remove is refused and says which exercise.
  await lib.getByRole('button', { name: 'Remove the equipment Landmine' }).dblclick();
  await expect(page.getByText(/Landmine is on Landmine Press/)).toBeVisible();
  await expect(lib.getByText('Your equipment')).toBeVisible();
});
