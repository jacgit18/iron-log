import { test, expect } from './fixtures.js';

// The program mode menu sits on the Workout / Stretches row, so a phone shows one row where it showed two.
test('on a phone the mode menu shares a row with Workout / Stretches', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  const sw = await page.locator('#board-workout').boundingBox();
  const mode = await page.locator('#board-mode').boundingBox();
  expect(Math.abs(sw.y - mode.y)).toBeLessThan(30);
  expect(mode.x + mode.width).toBeLessThanOrEqual(375);
});

test('the mode menu is on the Workout view only, and Mode 2 adds the A / B switch to the week bar', async ({ page }) => {
  const mode = page.locator('#board-mode');
  await expect(mode).toBeVisible();
  await expect(page.locator('header.top .pill')).toHaveCount(0); // the program and mode pills are gone from the header
  await expect(page.getByRole('group', { name: 'Program this week' })).toHaveCount(0);
  await mode.selectOption('2');
  const sw = page.locator('.weekbar').getByRole('group', { name: 'Program this week' });
  await expect(sw).toBeVisible();
  await expect(page.locator('header.top').getByRole('group', { name: 'Program this week' })).toHaveCount(0); // not in the header any more: that row is the title, Help and the colours button
  await expect(page.locator('.weeknav').getByRole('group', { name: 'Program this week' })).toHaveCount(0); // a sibling of the week switcher, not inside it
  await expect(page.locator('#progswitch-note')).toHaveText('Set by month'); // said to a screen reader with the switch
  expect((await page.locator('#progswitch-note').boundingBox()).width).toBeLessThanOrEqual(1); // and not drawn beside it
  await expect(sw.locator('button').first()).toHaveText('A'); // a small slider that says A or B
  await expect(sw.locator('button').nth(1)).toHaveText('B');
  const pill = await sw.boundingBox();
  expect(pill.height).toBeLessThanOrEqual(34);
  expect((await sw.locator('button').first().boundingBox()).height).toBeGreaterThanOrEqual(44); // the touch target stays 44px
  await sw.locator('button[aria-pressed="false"]').click(); // the other program than the month's
  await expect(sw).toHaveAttribute('data-pos', /^[ab]$/);
  await expect(page.locator('#progswitch-note')).toContainText('Switched');
  await page.click('#tab-daily');
  await expect(page.getByRole('group', { name: 'Program this week' })).toHaveCount(0); // it acts on the Board's week, so it is only there
  await page.click('#tab-board');
  await page.click('#board-stretches');
  await expect(mode).toHaveCount(0);
  await page.click('#board-workout');
  await expect(mode).toHaveValue('2');
});

test('a renamed program keeps its letter in the slider button name, and its full name on hover', async ({ page }) => {
  await page.locator('#board-mode').selectOption('2'); // saved to this browser
  await page.evaluate(() => {
    const cfg = JSON.parse(localStorage.getItem('ironlog:config/main') || '{}');
    cfg.progNames = { A: 'Upper', B: 'Lower' };
    localStorage.setItem('ironlog:config/main', JSON.stringify(cfg));
  });
  await page.reload();
  const sw = page.locator('.weekbar').getByRole('group', { name: 'Program this week' });
  await expect(sw.locator('button').first()).toHaveAttribute('aria-label', 'A: Upper');
  await expect(sw.locator('button').nth(1)).toHaveAttribute('aria-label', 'B: Lower');
  await expect(sw.locator('button').first()).toHaveAttribute('title', 'Upper');
  await expect(sw.locator('button').first()).toHaveText('A'); // what is drawn is the letter; the name above starts with it
});

// The week bar: the week switcher at the left, the A / B switch level with it at the right end. There is no progress row (Progress shows the week).
for (const [name, width] of [['phone', 375], ['desktop', 1280]]) {
  test(`${name}: the A / B switch is at the right of the week switcher's row and there is no progress row`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#board-mode').selectOption('2');
    const box = async sel => page.locator(sel).first().boundingBox();
    const nav = await box('.weekbar .weeknav');
    const sw = await box('.weekbar .progswitch');
    expect(Math.abs((sw.y + sw.height / 2) - (nav.y + 22))).toBeLessThan(14); // level with the first row of the week switcher
    expect(sw.x).toBeGreaterThan(nav.x + nav.width - 1); // to its right, not wrapped under it
    expect(sw.x + sw.width).toBeLessThanOrEqual(width - 8);
    await expect(page.locator('.weekbar .progress')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('in Mode 1 the week bar has no switch and no progress row', async ({ page }) => {
  await expect(page.locator('.weekbar .progswitch')).toHaveCount(0);
  await expect(page.locator('.weekbar .weeknav')).toBeVisible();
  await expect(page.locator('.weekbar .progress')).toHaveCount(0);
});

// Wide screens: the body weight leaves its own row and sits right after the mode menu in the Workout / Stretches row, small. A phone keeps it under the notices.
test('desktop: the body weight sits next to the mode menu, small, and is drawn once', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const box = async sel => page.locator(sel).first().boundingBox();
  const mode = await box('.modesel');
  const bw = await box('.boardtabtop > .bwrow');
  expect(Math.abs((bw.y + bw.height / 2) - (mode.y + mode.height / 2))).toBeLessThan(10); // on the mode menu's row
  expect(bw.x).toBeGreaterThanOrEqual(mode.x + mode.width); // after it
  expect(bw.x - (mode.x + mode.width)).toBeLessThan(40); // and close to it
  expect(bw.width).toBeLessThan(400);
  await expect(page.locator('.weekbar .bwrow')).toHaveCount(0);
  await expect(page.locator('.bwrow .bwsub')).toBeHidden(); // the shorter label
  await expect(page.locator('.bwrow')).toHaveCount(1); // drawn once
  await page.locator('.boardtabtop > .bwrow input').fill('180');
  await page.locator('.boardtabtop > .bwrow').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.boardtabtop > .bwrow b')).toHaveText('180 lb');
});

test('desktop: the body weight is not on the Stretches view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click('#board-stretches');
  await expect(page.locator('.bwrow')).toHaveCount(0);
});

test('phone: the body weight stays under the notices, not next to the mode menu', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.locator('.boardtabtop > .bwrow')).toHaveCount(0);
  await expect(page.locator('.boardroot > .bwrow')).toHaveCount(1);
});

// The body weight is drawn in one of two places (next to the mode menu above 700px, under the notices below), so the form's state lives above both:
// turning a phone to landscape in the middle of an edit must not lose what was typed or close the form.
test('turning the screen across 700px in the middle of a body weight entry keeps what was typed', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await page.locator('.boardroot > .bwrow input').fill('181.5');
  await page.setViewportSize({ width: 1280, height: 900 }); // landscape: the row moves next to the mode menu
  await expect(page.locator('.boardtabtop > .bwrow input')).toHaveValue('181.5');
  await page.setViewportSize({ width: 375, height: 812 }); // and back under the notices
  await expect(page.locator('.boardroot > .bwrow input')).toHaveValue('181.5');
});

test('turning the screen across 700px in the middle of editing a saved body weight keeps the form open', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await page.locator('.boardroot > .bwrow input').fill('180');
  await page.locator('.boardroot > .bwrow').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.boardroot > .bwrow b')).toHaveText('180 lb');
  await page.locator('.boardroot > .bwrow').getByRole('button', { name: 'Edit' }).click();
  await page.locator('.boardroot > .bwrow input').fill('182');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.boardtabtop > .bwrow input')).toHaveValue('182'); // still editing, number kept
  await page.locator('.boardtabtop > .bwrow').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.boardtabtop > .bwrow b')).toHaveText('182 lb');
});

test('the typed body weight does not carry over to another week', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('.boardtabtop > .bwrow input').fill('190');
  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(page.locator('.boardtabtop > .bwrow input')).toHaveValue('');
});
