import { test, expect } from './fixtures.js';

// Second-pass audit S2-09: a program name with one very long word made the Program editor's heading, and so the page, scroll sideways at a large text size
// (the heading was 404px wide in a 320px page). The heading now breaks inside a word when it has to.
const NAME = 'Supercalifragilisticexpialidocious strength block 60c';

for (const [w, zoom] of [[320, true], [390, true], [320, false]]) {
  test(`${w}px${zoom ? ' at 200% text' : ''}: a program name with a very long word does not make the Program tab scroll sideways`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 700 });
    if (zoom) await page.addStyleTag({ content: 'html{font-size:200%!important}' });
    await page.click('#tab-program');
    await page.getByRole('button', { name: 'Programs', exact: true }).click();
    await page.getByRole('button', { name: 'Create a program' }).click();
    await page.getByLabel('Name').fill(NAME);
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /^Not yet/ }).click();
    await expect(page.locator('#ed-title')).toContainText('Supercalifragilisticexpialidocious');
    const m = await page.evaluate(() => { const h = document.querySelector('#ed-title').getBoundingClientRect(); return { scroll: document.documentElement.scrollWidth, w: innerWidth, hRight: h.right }; });
    expect(m.scroll, `page ${m.scroll} wide in ${m.w}`).toBeLessThanOrEqual(m.w);
    expect(m.hRight).toBeLessThanOrEqual(m.w);
  });
}

// Review of PR 412: the rule was first on .edpanel, which the Exercise and Stretch libraries share, and it broke their Edit buttons into "Ed / it".
for (const lib of ['Exercise library', 'Stretch library']) {
  test(`${lib} at 320px: the Edit buttons stay on one line`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.click('#tab-program');
    await page.getByRole('button', { name: lib, exact: true }).click();
    const edits = page.locator('.exlib .btn.sm', { hasText: /^Edit$/ });
    await expect(edits.first()).toBeVisible();
    const bad = await edits.evaluateAll(els => els.filter(e => e.getBoundingClientRect().height > 46).length);
    expect(bad).toBe(0);
  });
}

// Audit O-7: the program library (Load, Edit, Delete) sits inside the same .edprog panel whose overflow-wrap rule broke the Exercise library's Edit buttons.
// A program with a very long word in its name must not make those buttons break inside themselves, nor the page scroll sideways.
for (const [w, zoom] of [[320, false], [320, true]]) {
  test(`${w}px${zoom ? ' at 200% text' : ''}: the program library buttons stay on one line next to a long program name`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    if (zoom) await page.addStyleTag({ content: 'html{font-size:200%!important}' });
    await page.click('#tab-program');
    await page.getByRole('button', { name: 'Programs', exact: true }).click();
    await page.getByRole('button', { name: 'Create a program' }).click();
    await page.getByLabel('Name').fill(NAME);
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /^Not yet/ }).click();
    await expect(page.locator('#ed-title')).toContainText('Supercalifragilisticexpialidocious');
    await page.getByRole('group', { name: 'Program to edit' }).getByRole('button', { name: 'Program A' }).click(); // the library list is under Program A and B
    const rowBtns = page.locator('.lib .edrow .edbtns .btn');
    await expect(rowBtns.first()).toBeVisible();
    const m = await rowBtns.evaluateAll(els => els.map(e => { const lh = parseFloat(getComputedStyle(e).lineHeight) || 16; return { t: e.textContent, h: e.getBoundingClientRect().height, lh }; }));
    expect(m.length).toBeGreaterThanOrEqual(2); // Edit and Delete (Load too when it is not the one in use)
    for (const b of m) expect(b.h, `${b.t} button ${b.h}px tall (line ${b.lh}px)`).toBeLessThan(b.lh * 2 + 20); // one line plus padding, not two
    const x = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, w: innerWidth }));
    expect(x.scroll, `page ${x.scroll} wide in ${x.w}`).toBeLessThanOrEqual(x.w);
  });
}
