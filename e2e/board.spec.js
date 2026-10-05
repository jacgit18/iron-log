import { test, expect } from './fixtures.js';

const restBox = (page, d) => page.locator(`#rest-${d}`);

test('checking a card off counts it done, and unchecking undoes it', async ({ page }) => {
  const box = page.locator('#chk-A-d1s1');
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect(box).not.toBeChecked();
});

test('a rest day shifts the later workouts and unticking puts them back', async ({ page }) => {
  await expect(page.locator('#col-3 #chk-A-d3s1')).toHaveCount(1);
  await restBox(page, 3).check();
  await expect(restBox(page, 3)).toBeChecked();
  await expect(page.locator('#col-4 #chk-A-d3s1')).toHaveCount(1);
  await restBox(page, 3).uncheck();
  await expect(page.locator('#col-3 #chk-A-d3s1')).toHaveCount(1);
});

test('a second rest day asks before pushing workouts off the week, and cancel changes nothing', async ({ page }) => {
  await restBox(page, 3).check();
  let asked = '';
  page.once('dialog', d => { asked = d.message(); d.dismiss(); });
  await restBox(page, 5).click(); // cancelled, so it stays unticked
  expect(asked).toContain('off the week');
  await expect(restBox(page, 5)).not.toBeChecked();
  await expect(restBox(page, 5)).not.toBeChecked();
});

test('accepting skips the pushed-off workouts and both rest days stay ticked', async ({ page }) => {
  await restBox(page, 3).check();
  page.once('dialog', d => d.accept());
  await restBox(page, 5).check();
  await expect(restBox(page, 3)).toBeChecked();
  await expect(restBox(page, 5)).toBeChecked();
  await restBox(page, 5).uncheck();
  await expect(restBox(page, 5)).not.toBeChecked();
  await expect(restBox(page, 3)).toBeChecked();
});

test('finishing a day suggests a new order; Apply moves the days and focuses Put back, which restores them', async ({ page }) => {
  // Program A: Leg Extension is on Days 2 and 3, so finishing Day 2 suggests a new order for Days 3 to 6.
  await page.locator('#day-2').check();
  const note = page.getByRole('status').filter({ hasText: 'Back-to-back' });
  await expect(note).toContainText('Leg Extension ISO hold is on Day 2 and Day 3.');
  await expect(page.locator('#col-3 #chk-A-d3s1')).toHaveCount(1);
  await note.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('#col-6 #chk-A-d3s1')).toHaveCount(1); // the Day 3 workout moved to Day 6
  const putBack = page.getByRole('button', { name: 'Put back' });
  await expect(putBack).toBeFocused();
  await putBack.click();
  await expect(page.locator('#col-3 #chk-A-d3s1')).toHaveCount(1);
  await expect(putBack).toHaveCount(0);
});
