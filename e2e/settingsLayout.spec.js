import { test, expect } from './fixtures.js';

// Settings is four groups (Training, Data, App, then Erase & delete last) with a jump row. The row moves focus to a group's heading, then scrolls to it.
// GitHub backup is gone (ADR 035): the data file is the one backup path.
const openSettings = async page => { await page.click('#tab-settings'); await expect(page.getByRole('heading', { name: 'Export & import' })).toBeAttached(); };

test('Settings has the four groups, one export and import panel, and no GitHub backup', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  for (const name of ['Training', 'Data', 'App', 'Erase & delete']) await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Export & import' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Export all data', exact: true })).toBeVisible();
  await expect(page.getByText('Import from file')).toBeVisible();
  await expect(page.getByText(/GitHub/i)).toHaveCount(0);
});

test('the jump row focuses the group heading and brings it into view', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await page.getByRole('navigation', { name: 'Jump to a settings group' }).getByRole('button', { name: 'App' }).click();
  await expect(page.locator('#set-app-h')).toBeFocused();
  await expect(page.locator('#set-app-h')).toBeInViewport();
});

test('Settings does not scroll sideways on a narrow phone at a large text size', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await openSettings(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(wide).toBe(false);
});

test('Erase starts with nothing ticked, and its button says how many parts it erases', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  const erase = page.locator('section.erase');
  for (const box of await erase.getByRole('checkbox').all()) await expect(box).not.toBeChecked();
  await expect(erase.getByRole('button', { name: 'Tick what to erase' })).toBeDisabled();
  await erase.getByRole('checkbox').nth(0).check();
  await erase.getByRole('checkbox').nth(2).check();
  await expect(erase.getByRole('button', { name: 'Erase 2 selected' })).toBeEnabled();
});

test('the 1RM table is folded until opened', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  const fold = page.locator('details.fold');
  await expect(fold.locator('table')).toBeHidden();
  await fold.locator('summary').click();
  await expect(fold.locator('table')).toBeVisible();
});

test('on a phone each phase is one block: the % stays beside its box and the columns line up', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await openSettings(page);
  const rows = await page.locator('.phrow').evaluateAll(rs => rs.map(r => {
    const pct = r.querySelector('.pctin'); const box = pct.querySelector('input');
    const sign = pct.lastChild; const range = document.createRange(); range.selectNodeContents(sign);
    return { sameLine: !box || Math.abs(range.getBoundingClientRect().top - box.getBoundingClientRect().top) < box.getBoundingClientRect().height, rxLeft: Math.round(r.children[2].getBoundingClientRect().left) };
  }));
  expect(rows.length).toBeGreaterThan(3);
  expect(rows.every(r => r.sameLine)).toBe(true);
  expect(new Set(rows.map(r => r.rxLeft)).size).toBe(1);
  await expect(page.getByLabel('Strength % of 1RM')).toBeVisible();
  await expect(page.getByLabel('Strength sets × reps')).toBeVisible();
});

for (const [width, height] of [[375, 812], [1280, 800]]) test(`the jump row stays on screen, marks the group being read, and a jump lands below it (${width} px)`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await openSettings(page);
  const nav = page.getByRole('navigation', { name: 'Jump to a settings group' });
  await expect(nav.getByRole('button', { name: 'Training' })).toHaveAttribute('aria-current', 'true');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(nav).toBeInViewport();
  await expect(nav.getByRole('button', { name: 'Erase' })).toHaveAttribute('aria-current', 'true');
  await nav.getByRole('button', { name: 'Data' }).click();
  await expect(page.locator('#set-data-h')).toBeFocused();
  await expect(nav.getByRole('button', { name: 'Data' })).toHaveAttribute('aria-current', 'true');
  // Once the smooth scroll settles, the heading sits just below the sticky row, not under it.
  await expect.poll(() => page.evaluate(() => document.getElementById('set-data-h').getBoundingClientRect().top - document.querySelector('.sjump').getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(-1);
  await expect(page.locator('#set-data-h')).toBeInViewport();
});
