import { test, expect } from './fixtures.js';

// How long notices stay, how many show, and the way out of the injury prevention ones. The fixture's clock is fake: runFor moves it.
const first = page => page.locator('.col.sel article.card > .row1 > input.chk').first();
const untick = async page => { const box = first(page); await box.check(); await box.uncheck(); };
const undoNote = page => page.locator('.toasts .notice[data-kind="undo"]');
const info = page => page.locator('.toasts .notice[data-kind="info"]');

test('an undo notice goes by itself after ten seconds, and waits while the pointer is on it', async ({ page }) => {
  await untick(page);
  await expect(undoNote(page)).toContainText('Unchecked');
  await undoNote(page).hover();
  await page.clock.runFor(30_000);
  await expect(undoNote(page)).toHaveCount(1); // held while the pointer is on it
  await page.mouse.move(5, 5);
  await page.clock.runFor(11_000);
  await expect(undoNote(page)).toHaveCount(0);
});

test('a status message goes by itself, and a failure would not', async ({ page }) => {
  await untick(page);
  await undoNote(page).getByRole('button', { name: 'Undo' }).click();
  await expect(info(page)).toContainText('Put back');
  await page.clock.runFor(8_000);
  await expect(info(page)).toHaveCount(0);
});

test('only two of the Board notices show; the rest wait and a +n more line says so', async ({ page }) => {
  // Four notices put in the list by hand, to test the stacking rule on its own (the list is empty until a real one shows).
  await page.evaluate(() => {
    document.querySelector('.toastlist').innerHTML = [1, 2, 3, 4].map(n => `<div class="notice" data-kind="undo">Notice ${n}</div>`).join('');
  });
  const shown = page.locator('.toastlist > .notice:visible');
  await expect(shown).toHaveCount(2);
  await expect(shown.nth(1)).toHaveText('Notice 2');
  const moreShown = () => page.evaluate(() => getComputedStyle(document.querySelector('.toastlist'), '::after').display !== 'none');
  expect(await moreShown()).toBe(true);
  await page.evaluate(() => document.querySelectorAll('.toastlist > .notice').forEach((n, i) => { if (i > 1) n.remove(); }));
  expect(await moreShown()).toBe(false); // two or fewer: nothing waits
});

test('the heads-up and the suggestion can turn injury prevention off from the notice', async ({ page }) => {
  await page.locator('#tab-settings, #account-badge').first().click();
  await page.getByRole('switch', { name: 'Injury prevention' }).check();
  await page.locator('#tab-board').click();
  for (const id of ['A-d2s1', 'A-d2s2-0', 'A-d2s3', 'A-d2s4', 'A-d2s5-0', 'A-d2s5-1', 'A-d2s6-0', 'A-d2s6-1']) await page.locator(`#chk-${id}`).check();
  const note = page.locator('.toasts .notice[data-kind="suggestion"]');
  await expect(note).toContainText('Back-to-back');
  await note.getByRole('button', { name: 'Turn off' }).click();
  await expect(note).toHaveCount(0);
  await expect(info(page)).toContainText('Injury prevention is off');
  await page.locator('#tab-settings, #account-badge').first().click();
  await expect(page.getByRole('switch', { name: 'Injury prevention' })).not.toBeChecked();
});
