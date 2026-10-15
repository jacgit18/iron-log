import { test, expect } from './fixtures.js';

// The Help sheet: a getting-started list first, then where things are, then the words. The labels it names must be the ones on screen.
test('Help starts with getting started and points at Experiments for an exercise seen online', async ({ page }) => {
  await page.locator('#help-btn').click();
  const help = page.locator('.sheet.help');
  await expect(help.getByRole('heading', { level: 3 }).first()).toHaveText('Getting started');
  const start = help.getByRole('region', { name: 'Getting started' });
  await expect(start.locator('li')).toHaveCount(6);
  await expect(start).toContainText('+ Add experiment');
  await expect(start).toContainText('Video link');
  await expect(start).toContainText('Copy problem details');
  await expect(help.getByRole('region', { name: 'Where things are' })).toContainText('Groceries');
  await expect(help).not.toContainText('which is coming');

  // Every glossary word once (they are the React keys too).
  const terms = await help.locator('.glossary dt').allTextContents();
  expect(new Set(terms).size).toBe(terms.length);
  for (const t of ['Experiments', 'Video link', 'Starter programs', '⋯ (card menu)', 'Swipe (phone)', 'Injury prevention', 'Storage full / Not saved', 'Could not read saved data']) expect(terms).toContain(t);

  await help.getByRole('button', { name: 'Close' }).click();
  await expect(help).toHaveCount(0);
  // The buttons Help names are on the board.
  await expect(page.getByRole('button', { name: '+ Add experiment' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Sort and filter exercises' }).getByText('Sort by muscle')).toBeVisible();
});
