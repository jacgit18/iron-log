import { test, expect } from './fixtures.js';

// The exercise charts are a drill-in of the hub, which is what a window under 1280px shows.
test.use({ viewport: { width: 1100, height: 900 } });

test('a session edited and deleted in the exercise sheet changes just that session', async ({ page }) => {
  // Two check-offs of Hack Squat this week (Day 3 and Day 5 cards) give two sessions.
  await page.locator('#chk-A-d3s1').check();
  await page.locator('#chk-A-d5s3').check();
  await page.locator('#tab-progress').click();
  await page.getByRole('button', { name: 'Exercise charts' }).click();
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
  await del.click();
  await expect(rows.first()).toHaveClass(/removing/); // the first tap marks the row
  await rows.first().getByRole('button', { name: 'Delete?' }).click();
  await expect(rows).toHaveCount(1);
  await expect(page.locator('table.hist')).not.toContainText('300 lb'); // the edited one went, the other stayed
  // The Removed notice takes focus on Undo, which puts the same session back once.
  const note = page.locator('.removednote');
  await expect(note).toContainText('Removed the');
  await expect(note.getByRole('button', { name: 'Undo' })).toBeFocused();
  await note.getByRole('button', { name: 'Undo' }).click();
  await expect(note).toHaveCount(0);
  await expect(rows).toHaveCount(2);
  await expect(page.locator('table.hist')).toContainText('300 lb');
});
