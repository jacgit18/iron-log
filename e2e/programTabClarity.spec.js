import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Program tab clarity (brief: briefs/program-tab-clarity): a header card, Day at a glance with a fold, rows with facts, Saved programs, a first-time guide, and a phone layout
// with a floating New program pill. What a unit test cannot catch: where things sit, that the guide costs no layout shift, the pill above the tab bar and hidden by the timer,
// and that the controls still do what they did. The wording logic is `src/lib/programRowFacts.test.ts`.
const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
const openPrograms = async page => { await page.goto('/#/program'); await expect(page.locator('#ed-title')).toBeVisible(); };
const stubShare = page => page.evaluate(() => {
  window.__shared = []; window.__copied = [];
  Object.defineProperty(navigator, 'share', { configurable: true, value: async d => { window.__shared.push(d); } });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__copied.push(t); } } });
});
// The fixture hides the guide on every load; this shows it on the first load of a test only, so "Got it" and a reload can be checked.
const showGuideOnce = async page => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('guide-shown')) return;
    sessionStorage.setItem('guide-shown', '1');
    localStorage.removeItem('ironlog:hideprogramguide');
  });
  await page.goto('/#/program');
  await page.reload();
};

test.describe('on a computer', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('the first screen has one header card with the A | B switch and Create, and no strip of cards', async ({ page }) => {
    await openPrograms(page);
    const head = page.locator('.proghead');
    await expect(head).toContainText('You are editing');
    await expect(head).toContainText('Program A');
    await expect(head.getByText('On your Board')).toBeVisible();
    await expect(head.getByRole('group', { name: 'Program to edit' })).toBeVisible();
    await expect(head.getByRole('button', { name: 'Create a program' })).toBeVisible();
    await expect(page.locator('.progstrip')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Program to edit' })).toHaveCount(1); // no second A | B row
    await expect(page.locator('.programfab')).toBeHidden();
    await head.getByRole('button', { name: 'Create a program' }).click();
    await expect(page.getByRole('heading', { name: 'Create a program' })).toBeVisible();
  });

  test('the five sections each say what they hold', async ({ page }) => {
    await openPrograms(page);
    const tabs = page.getByRole('group', { name: 'Program tab view' });
    await expect(tabs.getByRole('button', { name: 'Programs', exact: true })).toHaveAccessibleDescription(/weekly program/);
    await expect(tabs.getByRole('button', { name: 'Exercises', exact: true })).toHaveAccessibleDescription(/Every exercise/);
    await expect(tabs.getByRole('button', { name: 'Stretches', exact: true })).toHaveAccessibleDescription(/Stretches/);
    await expect(tabs.getByRole('button', { name: 'Saved', exact: true })).toHaveAccessibleDescription(/Programs you keep/);
    await expect(tabs.getByRole('button', { name: 'Compare', exact: true })).toHaveAccessibleDescription(/side by side/);
    await tabs.getByRole('button', { name: 'Stretches', exact: true }).click();
    await expect(page).toHaveURL(/#\/program\/stretches$/);
  });

  test('switching A and B in the header card changes the editor and the address; Back goes up; a reload reopens it', async ({ page }) => {
    await openPrograms(page);
    await page.locator('.proghead').getByRole('button', { name: 'Program B' }).click();
    await expect(page).toHaveURL(/#\/program\/b$/);
    await expect(page.locator('#ed-title')).toContainText('Program B');
    await expect(page.locator('.ph-name')).toHaveText('Program B');
    await page.reload();
    await expect(page.locator('#ed-title')).toContainText('Program B');
  });

  test('Day at a glance leads with exercises, sets and a sentence; the breakdown opens from the fold and the counts match the day tab', async ({ page }) => {
    await openPrograms(page);
    const sum = page.locator('.daysum');
    await expect(sum.getByRole('heading', { name: 'Day 1 at a glance' })).toBeVisible();
    const n = (await page.locator('.dtabs button.on small').innerText()).match(/(\d+) exercise/)[1];
    await expect(sum.locator('.daysum-strip div').first().locator('b')).toHaveText(n);
    await expect(sum.locator('.daysum-line')).not.toBeEmpty();
    const fold = sum.locator('.daysum-fold');
    await expect(fold).not.toHaveAttribute('open', '');
    await expect(sum.getByRole('heading', { name: 'Sets per phase' })).toBeHidden();
    await fold.getByText('See the full breakdown').click();
    await expect(sum.getByRole('heading', { name: 'Sets per phase' })).toBeVisible();
    await expect(sum.getByRole('heading', { name: 'Muscles worked · planned sets' })).toBeVisible();
  });

  test('a row shows its name, a role pill, sets and weight, and a phase pill; a superset sits in one boxed group; Edit and the ⋯ sheet still open', async ({ page }) => {
    await openPrograms(page);
    const row = page.locator('.edpanel:not(.lib) .edrow', { hasText: 'Lat Pulldown' }).first();
    await expect(row.locator('.edmain b')).toContainText('Lat Pulldown');
    await expect(row.locator('.rolepill')).toHaveText('Main lift');
    await expect(row.locator('.fact')).toContainText(/\d+ lb/);
    await expect(row.locator('.phpill')).toHaveText('Hypertrophy');
    const group = page.locator('.ssgroup').first();
    await expect(group.getByText('Superset', { exact: true })).toBeVisible();
    expect(await group.locator('.edrow').count()).toBeGreaterThan(0);
    const borders = await group.evaluate(g => ({ outer: getComputedStyle(g).borderTopWidth, row: getComputedStyle(g.querySelector('.edrow')).borderTopWidth }));
    expect(borders.outer).toBe('1px');
    await expect(page.locator('.sect', { hasText: 'Regular' }).first()).toContainText('The core of the day');
    await row.getByRole('button', { name: /^Edit / }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await row.getByRole('button', { name: /^More actions for / }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('dragging a row into a superset box slides the row it passes into the dragged row\'s old place, past the box header', async ({ page }) => {
    await openPrograms(page);
    const rows = page.locator('.edpanel:not(.lib) .edrow');
    const idx = await rows.evaluateAll(els => els.findIndex(e => e.closest('.ssgroup')));
    expect(idx).toBeGreaterThan(0);
    const dragged = rows.nth(idx - 1); const passed = rows.nth(idx);
    await dragged.evaluate(e => { e.scrollIntoView({ block: 'start' }); window.scrollBy(0, -200); }); // both rows on screen, so the pointer is too
    const d0 = await dragged.boundingBox(); const p0 = await passed.boundingBox();
    const handle = await dragged.locator('.draghandle').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + (p0.y + p0.height / 2) - (d0.y + d0.height / 2) + 8, { steps: 12 });
    await page.waitForTimeout(400); // the slide is a .15s transition
    const p1 = await passed.boundingBox(); // it has slid up into the dragged row's old place, not short of it
    expect(Math.abs(p1.y - d0.y), `passed row at ${p1.y}, dragged row started at ${d0.y}`).toBeLessThanOrEqual(2);
    await page.keyboard.press('Escape');
  });

  test('Saved programs: the new heading and copy, Save a copy, Edit, and Put on Board with its armed confirm', async ({ page }) => {
    await page.goto('/#/program/saved');
    await expect(page.getByRole('heading', { name: 'Saved programs' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Program library' })).toHaveCount(0);
    await page.getByRole('textbox', { name: /^Save Program A as/ }).fill('Kept copy');
    await page.getByRole('button', { name: 'Save a copy' }).click();
    const lib = page.locator('.lib .edrow', { hasText: 'Kept copy' });
    await expect(lib).toBeVisible();
    await expect(lib.getByRole('button', { name: 'Edit Kept copy' })).toBeVisible();
    await page.getByRole('group', { name: 'Program to edit' }).getByRole('button', { name: 'Program B' }).click();
    const put = page.getByRole('button', { name: 'Put Kept copy on Board' });
    await put.click();
    await expect(put).toContainText('Tap to replace Program B'); // armed: the first tap changes nothing
    await put.click();
    await expect(page.locator('.ph-name')).toHaveText('Kept copy'); // loaded into B, which takes the program's name (ADR 021)
  });

  test('the day tabs keep a 44px target', async ({ page }) => {
    await openPrograms(page);
    const m = await page.evaluate(() => [...document.querySelectorAll('.dtabs button')].map(el => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }));
    expect(m).toHaveLength(7);
    for (const b of m) { expect(b.w).toBeGreaterThanOrEqual(64); expect(b.h).toBeGreaterThanOrEqual(44); }
  });

  test('the first-time guide: four steps, no layout shift, Got it hides it for good, Open help opens Help', async ({ page }) => {
    await showGuideOnce(page);
    const guide = page.getByRole('region', { name: 'New here? Four things to know' });
    await expect(guide).toBeVisible();
    await expect(guide.locator('li')).toHaveCount(4);
    await expect(guide.locator('li').nth(3)).toContainText('Easier on a computer');
    const shift = await page.evaluate(() => new Promise(done => {
      let total = 0;
      new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) total += e.value; }).observe({ type: 'layout-shift', buffered: true });
      setTimeout(() => done(total), 500);
    }));
    expect(shift).toBeLessThan(0.01);
    expect(await scan(page).then(r => r.violations)).toEqual([]);
    await guide.getByRole('button', { name: 'Open help' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await guide.getByRole('button', { name: 'Got it' }).click();
    await expect(guide).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#ed-title')).toBeVisible();
    await expect(guide).toHaveCount(0);
  });

  test('Send me the link in the guide (step 4) shares this address, as the old tip did', async ({ page }) => {
    await showGuideOnce(page);
    await stubShare(page);
    await page.getByRole('region', { name: 'New here? Four things to know' }).getByRole('button', { name: 'Send me the link' }).click();
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
    expect((await page.evaluate(() => window.__shared))[0].url).toBe(new URL('/', page.url()).href);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('the header card has no Create button; a floating + New program pill sits above the tab bar and opens the same sheet', async ({ page }) => {
    await openPrograms(page);
    await expect(page.locator('.proghead .createprog')).toBeHidden();
    const fab = page.getByRole('button', { name: '+ New program' });
    await expect(fab).toBeVisible();
    const f = await fab.boundingBox(); const tabs = await page.locator('.tabs').boundingBox();
    expect(f.y + f.height).toBeLessThanOrEqual(tabs.y);
    expect(f.height).toBeGreaterThanOrEqual(44);
    expect(f.x + f.width).toBeLessThanOrEqual(375);
    expect(await scan(page).then(r => r.violations)).toEqual([]);
    await fab.click();
    await expect(page.getByRole('heading', { name: 'Create a program' })).toBeVisible();
    await expect(fab).toBeHidden(); // a sheet is open
  });

  test('the pill hides while the rest timer runs and comes back when it stops', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Rest timer' }).click();
    await page.goto('/#/program');
    await expect(page.locator('#ed-title')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ New program' })).toBeHidden();
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByRole('button', { name: '+ New program' })).toBeVisible();
  });

  test('the first exercise row is on the first screen; Add a day label and Copy day… still work', async ({ page }) => {
    await openPrograms(page);
    const first = await page.locator('.edpanel:not(.lib) .edrow').first().boundingBox();
    expect(first.y + first.height, `first row ends at ${first.y + first.height}`).toBeLessThanOrEqual(812);
    await expect(page.locator('.edadd .addfull')).toBeVisible();
    await expect(page.getByLabel('Day label')).toHaveCount(0);
    await page.getByRole('button', { name: 'Add a day label' }).click();
    const label = page.getByLabel('Day label');
    await expect(label).toBeFocused();
    await label.fill('Pull and legs');
    await label.press('Enter');
    await page.reload();
    await expect(page.getByLabel('Day label')).toHaveValue('Pull and legs'); // a day with a label shows the field
    await expect(page.getByLabel('Copy this day to')).toHaveCount(0);
    await page.getByRole('button', { name: 'Copy day…' }).click();
    await page.getByLabel('Copy this day to').selectOption('4');
    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible();
  });

  test('the old floating "plan on a computer" tip is gone; the Settings row stays', async ({ page }) => {
    await openPrograms(page);
    await expect(page.locator('#program-computer-hint')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Tip: plan on a computer' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Build programs on a computer' })).toBeVisible();
  });
});
