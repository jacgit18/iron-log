import { test, expect } from './fixtures.js';

// The Program tab's Compare section (brief program-compare). The compare rules are unit tested (src/lib/programCompare.test.ts); this checks the wiring:
// collapsed until opened, the filters, a saved program on one side, that nothing is editable, that nothing is written, the columns on a wide panel and A over B
// with the filters folded behind a button on a phone.
test.use({ viewport: { width: 1440, height: 900 } });

const open = async page => {
  await page.click('#tab-program');
  const toggle = page.getByRole('button', { name: 'Compare programs' });
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return page.locator('.cmpbody');
};
const count = async (body, label) => Number((await body.locator('.cmpchips').first().getByRole('button', { name: new RegExp(`^${label} \\d+$`) }).innerText()).match(/(\d+)$/)[1]);

test('the section is collapsed until it is opened, and closes again', async ({ page }) => {
  await page.click('#tab-program');
  const toggle = page.getByRole('button', { name: 'Compare programs' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.cmpbody')).toHaveCount(0);
  await open(page);
  expect(await page.locator('.cmpaligned').count()).toBeGreaterThan(0); // one list per day on a wide screen (All days)
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.cmpbody')).toHaveCount(0);
});

test('every day lists both programs, the counts add up, and a status filter hides the other rows', async ({ page }) => {
  const body = await open(page);
  const all = await count(body, 'All');
  const [same, chg, ph, onlyA, onlyB] = await Promise.all(['Same', 'Changed', 'Phase differs', 'Only in Program A', 'Only in Program B'].map(l => count(body, l)));
  expect(same + chg + ph + onlyA + onlyB).toBe(all);
  // one row per exercise: a paired exercise shows both programs in its row, an only-in exercise says so on the side that lacks it
  await expect(body.locator('.cmprow')).toHaveCount(all);
  for (const [label, tag] of [['Same', 'Same'], ['Changed', 'Changed'], ['Phase differs', 'Phase differs']]) {
    await body.getByRole('button', { name: new RegExp(`^${label} \\d+$`) }).click();
    const tags = await body.locator('.cmprow .tag').allTextContents();
    expect(tags.every(t => t === tag), `${label}: only ${tag} rows`).toBe(true);
  }
  await body.getByRole('button', { name: /^Any difference/ }).click();
  expect((await body.locator('.cmprow .tag').allTextContents()).includes('Same')).toBe(false);
  await body.getByRole('button', { name: /^All \d+$/ }).click();
  expect(await count(body, 'All')).toBe(all); // a filter never changes the counts
});

test('changing the day clears the phase filter, so a pressed chip always shows', async ({ page }) => {
  const body = await open(page);
  const phases = body.getByRole('group', { name: 'Phase' }).getByRole('button');
  await phases.nth(1).click();
  await expect(phases.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.cmpdays button').nth(3).click();
  await expect(phases.first()).toHaveText('Any phase');
  await expect(phases.first()).toHaveAttribute('aria-pressed', 'true');
});

test('a saved copy on the other side compares as the same, and the same program twice says so', async ({ page }) => {
  await page.click('#tab-program');
  await page.locator('#lib-name').fill('Compare copy');
  await page.getByRole('button', { name: 'Save a copy' }).click();
  const body = await open(page);
  await body.getByLabel('Second program').selectOption({ label: 'Compare copy' });
  await expect(body.getByRole('status')).toHaveCount(0);
  expect(await count(body, 'Any difference')).toBe(0);
  await body.getByLabel('Second program').selectOption('A');
  await expect(body.getByRole('status')).toHaveText('Both sides are the same program.');
});

test('nothing in the panel is editable and nothing is written', async ({ page }) => {
  const body = await open(page);
  const stored = () => page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => !k.startsWith('ironlog:hide')).sort()));
  const before = await stored();
  await expect(body.locator('.cmpaligned .draghandle, .cmpaligned .edbtns, .cmpaligned button')).toHaveCount(0);
  await page.locator('.cmpdays button').nth(2).click();
  await body.getByRole('button', { name: 'Any phase' }).click();
  await body.getByLabel('First program').selectOption('B');
  expect(await stored()).toBe(before);
});

test('on a phone the page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('wide: the two programs are columns; phone: the second program\'s line sits under the first', async ({ page }) => {
  const sides = async body => {
    const row = body.locator('.cmprow').first();
    const [one, two] = await row.locator('.cmpside').all();
    return [await one.boundingBox(), await two.boundingBox()];
  };
  let body = await open(page);
  let [one, two] = await sides(body);
  expect(two.x).toBeGreaterThan(one.x + one.width - 1); // beside it
  expect(Math.abs(two.y - one.y)).toBeLessThan(4);
  await expect(body.locator('.cmpcols').first()).toBeVisible();
  // Editor.css's .edrow loads after this panel's CSS: the row must still be the grid, and the status stripe must still show (it did not before 2026-11-06)
  const style = async (locator, prop) => locator.evaluate((el, p) => getComputedStyle(el)[p], prop);
  expect(await style(body.locator('.cmprow').first(), 'display')).toBe('grid');
  const stripe = row => Promise.all([style(row, 'borderLeftWidth'), style(row, 'borderLeftColor')]);
  const [sameWidth, sameColour] = await stripe(body.locator('.cmp-same').first());
  const [onlyWidth, onlyColour] = await stripe(body.locator('.cmp-only').first());
  expect(sameWidth).toBe('4px');
  expect(onlyWidth).toBe('4px');
  expect(onlyColour).not.toBe(sameColour);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  body = await open(page);
  [one, two] = await sides(body);
  expect(two.y).toBeGreaterThan(one.y); // under it
  expect(Math.abs(two.x - one.x)).toBeLessThan(4);
  await expect(body.locator('.cmpcols').first()).toBeHidden();
  await expect(body.locator('.cmprow').first().locator('.cmpwho').first()).toBeVisible(); // the program's name labels each line
});

test('on a phone the filters fold behind a Filter button; on a wide screen they stay in view', async ({ page }) => {
  let body = await open(page);
  await expect(body.getByRole('button', { name: /^Filter/ })).toBeHidden();
  await expect(body.getByRole('group', { name: 'Show rows' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  body = await open(page);
  const button = body.getByRole('button', { name: /^Filter/ });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(body.getByRole('group', { name: 'Show rows' })).toBeHidden();
  await expect(body.getByRole('group', { name: 'Compare day' })).toBeVisible(); // the day strip stays
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await body.getByRole('button', { name: /^Any difference/ }).click();
  await expect(button).toHaveText(/Filter · 1 on/);
  await button.click();
  await expect(body.getByRole('group', { name: 'Show rows' })).toBeHidden();
  expect(await body.locator('.cmprow .tag').allTextContents()).not.toContain('Same'); // a folded filter still applies
});

test('a changed exercise marks the differing weight on both sides', async ({ page }) => {
  await page.click('#tab-program');
  await page.locator('#lib-name').fill('Compare copy');
  await page.getByRole('button', { name: 'Save a copy' }).click();
  await page.locator('.edpanel:not(.lib) .edrow').first().getByRole('button', { name: /^Edit / }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Weight (lb)').fill('123');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  const body = await open(page);
  await body.getByLabel('Second program').selectOption({ label: 'Compare copy' });
  const changed = body.locator('.cmprow.cmp-chg');
  await expect(changed).toHaveCount(1);
  await expect(changed.locator('.cmpdiff')).toHaveCount(2); // the weight is marked on both sides
  await expect(changed.locator('.cmpside').first().locator('.cmpdiff')).toHaveText(/123 lb/);
  await expect(body.locator('.cmprow:not(.cmp-chg) .cmpdiff')).toHaveCount(0); // and nowhere else
});

test('All days lists every day under its own heading, and a filter applies to all of them', async ({ page }) => {
  const body = await open(page);
  const dayButtons = body.locator('.cmpdays button');
  await dayButtons.first().click();
  await expect(dayButtons.first()).toHaveText(/^All days/);
  await expect(dayButtons.first()).toHaveAttribute('aria-pressed', 'true');
  const heads = await body.locator('.cmpdayhead').allTextContents();
  expect(heads.length).toBeGreaterThan(1);
  expect(heads[0]).toBe('Day 1');
  const all = await count(body, 'All');
  await expect(body.locator('.cmprow')).toHaveCount(all); // the chip counts are the sum over every day
  await body.getByRole('button', { name: /^Same \d+$/ }).click();
  expect((await body.locator('.cmprow .tag').allTextContents()).every(t => t === 'Same')).toBe(true);
  await dayButtons.nth(1).click(); // back to one day: no day headings
  await expect(body.locator('.cmpdayhead')).toHaveCount(0);
});

test('a wide screen starts on All days; a phone starts on the editor\'s day', async ({ page }) => {
  const body = await open(page);
  await expect(body.locator('.cmpdays button').first()).toHaveAttribute('aria-pressed', 'true');
  expect(await body.locator('.cmpdayhead').count()).toBeGreaterThan(1);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  const phone = await open(page);
  await expect(phone.locator('.cmpdays button').first()).toHaveAttribute('aria-pressed', 'false');
  await expect(phone.locator('.cmpdayhead')).toHaveCount(0);
});

test('on a wide screen several days sit side by side as cards, and one day is a single card', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const body = await open(page);
  const cards = body.locator('.cmpdaygrid > .cmpaligned');
  expect(await cards.count()).toBeGreaterThan(2);
  const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
  expect(Math.abs(a.y - b.y)).toBeLessThan(4); // same row of cards
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);
  await body.locator('.cmpdays button').nth(1).click(); // Day 1 alone
  await expect(body.locator('.cmpdaygrid > .cmpaligned')).toHaveCount(1);
  const one = await body.locator('.cmpdaygrid > .cmpaligned').boundingBox();
  expect(one.width).toBeLessThan(a.width * 1.05); // a single day is one card wide, not the whole panel
});
