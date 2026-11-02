import { test, expect } from './fixtures.js';

// Settings is four groups (Training, Data, App, then Erase & delete last) with a jump row. The row moves focus to a group's heading, then scrolls to it.
// GitHub backup is gone (ADR 035): the data file is the one backup path.
const openSettings = async page => { await page.locator('#tab-settings, #account-badge').first().click(); await expect(page.getByRole('heading', { name: 'Backups & data' })).toBeAttached(); };

test('Settings has the four groups, one export and import panel, and no GitHub backup', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  for (const name of ['Training', 'Data', 'App', 'Erase & delete']) await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Backups & data' })).toHaveCount(1);
  await page.getByText('Save or load a file yourself').click(); // the automatic backups come first; the manual file copy is one fold below them
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

test('on a phone each phase is one block: the % stays beside its box and the columns line up', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await openSettings(page);
  await page.locator('#drill-phases').click();
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

for (const [width, height] of [[375, 812], [1280, 800]]) test(`the jump row (a bar on a phone, a rail on a wide screen) stays on screen, marks the group being read, and a jump lands clear of it (${width} px)`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await openSettings(page);
  const nav = page.getByRole('navigation', { name: 'Jump to a settings group' });
  await expect(nav.getByRole('button', { name: 'Training' })).toHaveAttribute('aria-current', 'true');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(nav).toBeInViewport();
  await expect(nav.getByRole('button', { name: 'Erase & delete' })).toHaveAttribute('aria-current', 'true');
  await nav.getByRole('button', { name: 'Data' }).click();
  await expect(page.locator('#set-data-h')).toBeFocused();
  await expect(nav.getByRole('button', { name: 'Data' })).toHaveAttribute('aria-current', 'true');
  // Once the smooth scroll settles: on a phone the heading sits just below the sticky row, not under it; on a wide screen the row is a rail beside it, and the heading is at the top.
  if (width > 900) await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('set-data-h').getBoundingClientRect().top))).toBeLessThan(40);
  else await expect.poll(() => page.evaluate(() => document.getElementById('set-data-h').getBoundingClientRect().top - document.querySelector('.sjump').getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(-1);
  await expect(page.locator('#set-data-h')).toBeInViewport();
});

test('each panel keeps its background in a closed fold named for it', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  const folds = page.locator('details.more');
  const names = await folds.locator('summary').allTextContents();
  expect(names.length).toBeGreaterThanOrEqual(3);
  expect(names.every(n => n.startsWith('More about '))).toBe(true);
  expect(new Set(names).size).toBe(names.length); // distinct, so a screen reader can tell them apart
  for (const open of await folds.evaluateAll(ds => ds.map(d => d.open))) expect(open).toBe(false);
  await page.locator('#drill-phases').click(); // Phases is a screen of its own
  const phases = folds.filter({ has: page.locator('summary', { hasText: 'More about phases' }) });
  await expect(phases.getByText(/placeholders until you set your own/)).toBeHidden();
  await phases.locator('summary').click();
  await expect(phases.getByText(/placeholders until you set your own/)).toBeVisible();
});

// Waits until a smooth scroll has stopped: the page position is the same two frames running.
const settled = page => page.waitForFunction(() => new Promise(r => { const y = scrollY; requestAnimationFrame(() => requestAnimationFrame(() => r(scrollY === y))); }));
const gapBelowRow = (page, id) => page.evaluate(i => document.getElementById(i).getBoundingClientRect().top - document.querySelector('.sjump').getBoundingClientRect().bottom, id);

test('on a wide screen the jump row is a rail beside the groups, so focus is never hidden under it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await openSettings(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.evaluate(() => document.getElementById('set-training-h').scrollIntoView({ block: 'nearest' }));
  await settled(page);
  const { rail, head } = await page.evaluate(() => ({ rail: document.querySelector('.sjump').getBoundingClientRect().toJSON(), head: document.getElementById('set-training-h').getBoundingClientRect().toJSON() }));
  expect(rail.right).toBeLessThanOrEqual(head.left); // beside the group, never over it
  expect(rail.width).toBeLessThan(260);
});

test('with large text the chips wrap, and a jump still lands below the row', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await openSettings(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const nav = page.getByRole('navigation', { name: 'Jump to a settings group' });
  expect(await nav.evaluate(n => n.getBoundingClientRect().height)).toBeGreaterThan(100); // two lines of chips
  await nav.getByRole('button', { name: 'Data' }).click();
  await expect(page.locator('#set-data-h')).toBeFocused();
  await expect(page.locator('#set-data-h')).toBeInViewport();
  await settled(page);
  expect(await gapBelowRow(page, 'set-data-h')).toBeGreaterThanOrEqual(-1);
});

test('the erase warning and the import limit stay in view, not in a fold', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  const erase = page.locator('section.erase');
  const warning = erase.getByText('An export made after erasing holds the erased state');
  await expect(warning).toBeVisible();
  const [warnTop, buttonTop] = await Promise.all([warning.evaluate(e => e.getBoundingClientRect().top), erase.locator('.actions').evaluate(e => e.getBoundingClientRect().top)]);
  expect(warnTop).toBeLessThan(buttonTop); // read before the button, not after
  await expect(page.locator('#imp-help')).toContainText('only brings back logged sessions');
});

test('the report downloads fit one line on a phone, name the shown week, and keep the full action for screen readers', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await openSettings(page);
  const group = page.getByRole('group', { name: 'Download' });
  const buttons = [group.getByRole('button', { name: 'Download Excel, every week' }), group.getByRole('button', { name: 'Download the week of Sep 20 as Excel' }), group.getByRole('button', { name: 'Download CSV' })];
  for (const b of buttons) await expect(b).toBeVisible();
  await expect(buttons[1]).toHaveText('Week of Sep 20'); // the week the Board shows, not always this one
  for (const b of buttons) {
    const oneLine = await b.evaluate(el => { const lh = parseFloat(getComputedStyle(el).lineHeight) || 20; const r = document.createRange(); r.selectNodeContents(el); return r.getClientRects().length === 1 || r.getBoundingClientRect().height < lh * 1.5; });
    expect(oneLine).toBe(true);
  }
});

test('a field that saves when you leave it shows a short Saved tick; a refused value does not', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await page.locator('#drill-phases').click();
  const pct = page.locator('#pct-strength');
  const label = page.locator('.phrow').filter({ has: pct }).locator('.phfield').first();
  await pct.fill('86');
  await pct.press('Enter'); // leaves the field: it saves
  await expect(label.getByText('✓ Saved')).toBeVisible();
  await expect(page.locator('#pct-strength')).toHaveValue('86');
  await page.clock.runFor(3100);
  await expect(label.getByText('✓ Saved')).toHaveCount(0);
  await page.locator('#pct-strength').fill('500'); // over the limit: refused, the box goes back
  await page.locator('#pct-strength').press('Enter');
  await expect(page.locator('#pct-strength')).toHaveValue('86');
  await expect(page.getByText('✓ Saved')).toHaveCount(0);
  const rest = page.locator('#rest-s');
  await rest.fill('120');
  await rest.press('Enter');
  await expect(page.locator('label[for="rest-s"]').getByText('✓ Saved')).toBeVisible();
});

test('Training shows three summary rows; each opens its own screen and Back returns to the row', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await expect(page.locator('#drill-mode')).toContainText('Mode 1');
  await expect(page.locator('#drill-phases')).toContainText('Strength 85% · 4 × 6');
  await expect(page.locator('#drill-maxes')).toContainText('1-rep maxes');
  await expect(page.locator('#rest-s')).toHaveCount(0); // the fields are on the screens, not on the page
  await page.locator('#drill-mode').click();
  await expect(page.getByRole('heading', { name: 'Program mode' })).toBeFocused();
  await expect(page.locator('#mode-2')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Data', exact: true })).toBeHidden(); // only the screen is shown
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await expect(page.locator('#drill-mode')).toBeFocused();
  await expect(page.getByRole('heading', { level: 2, name: 'Data', exact: true })).toBeVisible();
  await page.locator('#drill-phases').click();
  await page.goBack(); // the browser's Back closes it too
  await expect(page.locator('#drill-phases')).toBeVisible();
});

test('a change on a screen shows in its summary row', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await page.locator('#drill-mode').click();
  await page.locator('#mode-2').check();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await expect(page.locator('#drill-mode')).toContainText('Mode 2 · Alternate monthly');
});

test('choosing another tab with a Training screen open leaves no stale history entry behind', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await page.locator('#drill-phases').click();
  expect(await page.evaluate(() => history.state?.settingsScreen)).toBe('phases');
  await page.locator('#tab-board').click();
  await expect.poll(() => page.evaluate(() => history.state?.settingsScreen ?? null)).toBeNull(); // Back is not a dead press
  await page.locator('#tab-settings, #account-badge').first().click();
  await expect(page.locator('#drill-phases')).toBeVisible(); // Settings opens on its list, not on the screen
});
