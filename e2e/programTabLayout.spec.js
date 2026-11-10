import { test, expect } from './fixtures.js';

// Program tab desktop layout (brief program-tab-desktop-layout). The search rule is a node test (savedProgramFilter.test.ts); this covers where things sit and what the tabs do:
// the five tabs and their addresses with Back and reload, Add exercise and Copy day in the day heading, the day tabs with counts, the Saved and Compare views, and that a phone keeps
// its three tabs, its day stepper and dropdown, and sees Compare above Saved.
const open = async (page, path = '/#/program') => { await page.goto(path); await expect(page.getByRole('group', { name: 'Program tab view' })).toBeVisible(); };
const tabs = page => page.getByRole('group', { name: 'Program tab view' });

test.describe('on a computer', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('the strip has five tabs; Saved and Compare have addresses, Back goes up and a reload reopens them', async ({ page }) => {
    await open(page);
    await expect(tabs(page).getByRole('button')).toHaveText([/^ProgramsYour weekly/, /^ExercisesEvery/, /^StretchesStretches/, /^SavedPrograms you keep/, /^CompareTwo programs/]);
    await tabs(page).getByRole('button', { name: /^Saved/ }).click();
    await expect(page).toHaveURL(/#\/program\/saved$/);
    await expect(page.getByRole('heading', { name: 'Saved programs' })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/#\/program\/saved$/);
    await expect(page.getByRole('heading', { name: 'Saved programs' })).toBeVisible();
    await tabs(page).getByRole('button', { name: /^Compare/ }).click();
    await expect(page).toHaveURL(/#\/program\/compare$/);
    await expect(page.getByRole('heading', { name: 'Compare programs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Compare programs' })).toHaveCount(0); // open for good: no toggle
    await page.reload();
    await expect(page).toHaveURL(/#\/program\/compare$/);
  });

  test('Programs no longer ends with Saved programs or the Compare strip', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('heading', { name: 'Saved programs' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Compare programs' })).toHaveCount(0);
  });

  test('Add exercise is a normal-height button in the day heading beside Copy day…, which opens the picker', async ({ page }) => {
    await open(page);
    const add = page.getByRole('button', { name: '+ Add exercise' });
    const box = await add.boundingBox();
    expect(box.height).toBeLessThan(52); // it was 66 px: stretched to the row beside Copy this day to
    const title = await page.locator('#ed-title').boundingBox();
    expect(Math.abs((box.y + box.height / 2) - (title.y + title.height / 2))).toBeLessThan(30); // in the heading row
    await expect(page.getByLabel('Copy this day to')).toHaveCount(0);
    await page.getByRole('button', { name: 'Copy day…' }).click();
    await expect(page.getByLabel('Copy this day to')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy day…' })).toHaveCount(0);
  });

  test('the day switcher is one row of day tabs with counts that changes the day; no stepper or dropdown', async ({ page }) => {
    await open(page);
    const days = page.getByRole('group', { name: 'Jump to day' });
    await expect(days.getByRole('button')).toHaveCount(7);
    await expect(days.getByRole('button', { name: /^Day 1/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(days.getByRole('button', { name: /^Day 1/ })).toContainText(/exercises?/);
    await expect(page.getByRole('button', { name: 'Next day' })).toHaveCount(0);
    await expect(page.getByLabel('Day to edit')).toHaveCount(0);
    await days.getByRole('button', { name: /^Day 3/ }).click();
    await expect(days.getByRole('button', { name: /^Day 3/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#ed-title')).toContainText('Day 3');
  });

  test('Saved: a copy is saved from the Saved tab, found by search, and a search with no match says so', async ({ page }) => {
    await open(page, '/#/program/saved');
    await page.locator('#lib-name').fill('Spring cut');
    await page.getByRole('button', { name: 'Save a copy' }).click();
    await page.locator('#lib-name').fill('Hotel gym');
    await page.getByRole('button', { name: 'Save a copy' }).click();
    await expect(page.getByRole('button', { name: 'Put Spring cut on Board' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Put Hotel gym on Board' })).toBeVisible();
    await page.locator('#lib-search').fill('spring');
    await expect(page.getByRole('button', { name: 'Put Spring cut on Board' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Put Hotel gym on Board' })).toHaveCount(0);
    await page.locator('#lib-search').fill('zzz');
    await expect(page.getByText('No saved program matches')).toBeVisible();
  });

  test('Saved with a saved program open in the editor still saves a copy of Program A and labels it Program A', async ({ page }) => {
    await open(page, '/#/program/saved');
    await page.locator('#lib-name').fill('Spring cut');
    await page.getByRole('button', { name: 'Save a copy' }).click();
    await page.getByRole('button', { name: 'Edit Spring cut' }).click();
    await expect(page.locator('#ed-title')).toContainText('Spring cut');
    await tabs(page).getByRole('button', { name: /^Saved/ }).click();
    await expect(page.getByLabel(/^Save Program A as/)).toBeVisible();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.locator('#lib-name').fill('Second copy');
    await page.getByRole('button', { name: 'Save a copy' }).click(); // it used to throw: Program L:... has no days
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
    await expect(page.locator('.lib .edrow', { hasText: 'Spring cut' })).toBeVisible();
    await expect(page.getByText(/Program L:/)).toHaveCount(0);
  });

  test('the search also filters the archived programs', async ({ page }) => {
    await open(page, '/#/program/saved');
    for (const n of ['Spring cut', 'Hotel gym']) { await page.locator('#lib-name').fill(n); await page.getByRole('button', { name: 'Save a copy' }).click(); }
    await page.getByRole('button', { name: 'Archive Spring cut' }).click();
    await page.getByRole('button', { name: 'Archive Hotel gym' }).click();
    await page.getByText('Archived (2)').click();
    await expect(page.getByRole('button', { name: 'Restore Spring cut' })).toBeVisible();
    await page.locator('#lib-search').fill('hotel');
    await expect(page.getByRole('button', { name: 'Restore Hotel gym' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restore Spring cut' })).toHaveCount(0);
  });

  test('Compare opens full width on its own tab', async ({ page }) => {
    await open(page, '/#/program/compare');
    const panel = page.locator('.cmppage');
    await expect(panel.getByLabel('First program')).toBeVisible();
    await expect(panel.getByLabel('Second program')).toBeVisible();
    const w = (await panel.boundingBox()).width;
    expect(w).toBeGreaterThan(1500);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the tabs are one word each, the stepper and dropdown stay, and Compare sits above Saved programs', async ({ page }) => {
    await open(page);
    await expect(tabs(page).getByRole('button')).toHaveText([/^ProgramsYour/, /^ExercisesEvery/, /^StretchesStretches/]);
    await expect(page.getByRole('button', { name: 'Next day' })).toBeVisible();
    await expect(page.getByLabel('Day to edit')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Jump to day' })).toHaveCount(0);
    const compare = await page.getByRole('button', { name: 'Compare programs' }).boundingBox();
    const saved = await page.getByRole('heading', { name: 'Saved programs' }).boundingBox();
    expect(compare.y).toBeLessThan(saved.y);
  });

  for (const width of [390, 320]) {
    test(`the A | B switch is two equal halves that fill the card at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await open(page);
      const seg = page.getByRole('group', { name: 'Program to edit' });
      const [a, b] = await seg.getByRole('button').all();
      const [box, ba, bb] = [await seg.boundingBox(), await a.boundingBox(), await b.boundingBox()];
      expect(Math.abs(ba.width - bb.width)).toBeLessThan(1);
      expect(ba.width + bb.width).toBeGreaterThan(box.width - 12); // the 3 px padding and the gap are all that is left
    });
  }

  test('a desktop-only address shows Programs on a phone', async ({ page }) => {
    await open(page, '/#/program/saved');
    await expect(page.locator('#ed-title')).toBeVisible();
    await expect(tabs(page).getByRole('button', { name: /^Programs/ })).toHaveAttribute('aria-pressed', 'true');
  });
});
