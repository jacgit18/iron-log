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

test('a second rest day that pushes one workout off the week skips it with a message, no question asked', async ({ page }) => {
  await restBox(page, 3).check();
  page.on('dialog', d => { throw new Error('unexpected dialog: ' + d.message()); });
  await restBox(page, 5).check();
  await expect(restBox(page, 3)).toBeChecked();
  await expect(restBox(page, 5)).toBeChecked();
  await expect(page.getByText(/Day 5 is a rest day now/)).toBeVisible();
  await restBox(page, 5).uncheck();
  await expect(restBox(page, 5)).not.toBeChecked();
  await expect(restBox(page, 3)).toBeChecked();
});

test('finishing a day\'s workout suggests moving one card; Apply moves it and focuses Undo, which restores it', async ({ page }) => {
  // Program A: Leg Extension is on Days 2 and 3. Tick Day 2's workout cards one by one, leaving the sled and Home
  // cards unticked; the suggestion moves Day 3's Leg Extension (A-d3s5) to Day 4.
  await page.locator('#tab-settings, #account-badge').first().click(); // suggestions need Injury prevention, which is off by default
  await page.getByRole('switch', { name: 'Injury prevention' }).check();
  await page.locator('#tab-board').click();
  for (const id of ['A-d2s1', 'A-d2s2-0', 'A-d2s3', 'A-d2s4', 'A-d2s5-0', 'A-d2s5-1', 'A-d2s6-0', 'A-d2s6-1']) await page.locator(`#chk-${id}`).check();
  await expect(page.locator('#chk-A-sled2')).not.toBeChecked();
  await expect(page.locator('#day-2')).not.toBeChecked(); // the day's box waits for the sled and Home cards
  const note = page.getByRole('status').filter({ hasText: 'Back-to-back' });
  await expect(note).toContainText('Leg Extension ISO hold is on Day 2 and Day 3. Moving Leg Extension ISO hold from Day 3 to Day 4 fixes it.');
  await expect(page.locator('#col-3 #chk-A-d3s5')).toHaveCount(1);
  await note.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('#col-4 #chk-A-d3s5')).toHaveCount(1); // just that card moved
  await expect(page.locator('#col-3 #chk-A-d3s1')).toHaveCount(1); // the rest of Day 3 stayed
  const putBack = page.getByRole('status').filter({ hasText: 'Moved for this week' }).getByRole('button', { name: 'Undo' });
  await expect(putBack).toBeFocused();
  await putBack.click();
  await expect(page.locator('#col-3 #chk-A-d3s5')).toHaveCount(1);
  await expect(putBack).toHaveCount(0);
});

test('pull down to refresh is left on when idle, and switched off while a timer runs or a sheet is open', async ({ page }) => {
  const pull = () => page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY);
  expect(await pull()).toBe('auto');
  await page.getByRole('button', { name: 'Rest timer' }).click();
  await expect.poll(pull).toBe('none');
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect.poll(pull).toBe('auto');
  await page.locator('#log-A-d1s1-0').click();
  await expect.poll(pull).toBe('none');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect.poll(pull).toBe('auto');
});

test('in the log sheet, Enter moves weight to reps to the next set, and Enter in the last box saves', async ({ page }) => {
  await page.locator('#log-A-d1s1-0').click();
  const dialog = page.getByRole('dialog');
  const w1 = dialog.getByLabel('Set 1 weight in lb'), r1 = dialog.getByLabel(/^Set 1 (reps|hold)/), w2 = dialog.getByLabel('Set 2 weight in lb');
  await w1.fill('135');
  await w1.press('Enter');
  await expect(r1).toBeFocused();
  await expect(dialog).toBeVisible(); // Enter did not save the sheet
  await r1.fill('8');
  await r1.press('Enter');
  await expect(w2).toBeFocused();
  // set 2 followed set 1's weight; its contents are selected on focus, so typing replaces them
  await expect(w2).toHaveValue('135');
  await page.keyboard.type('9');
  await expect(w2).toHaveValue('9');
  // the last box says Done and Enter there saves
  const rows = await dialog.locator('.setrow').count();
  const lastReps = dialog.getByLabel(new RegExp(`^Set ${rows} (reps|hold)`));
  await expect(lastReps).toHaveAttribute('enterkeyhint', 'done');
  await expect(w1).toHaveAttribute('enterkeyhint', 'next');
  await lastReps.fill('8');
  await lastReps.press('Enter');
  await expect(dialog).toBeHidden();
});

test('a home-screen shortcut opens its tab and drops the parameter', async ({ page }) => {
  await page.goto('/?open=daily');
  await expect(page.locator('#tab-daily')).toHaveAttribute('aria-selected', 'true');
  expect(new URL(page.url()).search).toBe('');
});

test('the page has a theme-color per OS scheme, the manifest shortcuts and the iOS splash images', async ({ page }) => {
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
  await expect(page.locator('link[rel="apple-touch-startup-image"]')).toHaveCount(5);
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.shortcuts.map(sc => sc.url)).toEqual(['./?open=board', './?open=daily']);
});
