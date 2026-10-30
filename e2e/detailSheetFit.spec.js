import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// The Detail sheet (Progress > a lift card) lists every session of a lift with Edit and delete buttons. Its six-column table was wider than the sheet on
// every phone (394px in a 390px sheet), so the buttons ended past the screen edge. On a phone each entry is now a two-line card (DetailSheet.css).
const SESSIONS = [['2026-08-04', 80, 8, ''], ['2026-08-11', 87.5, 9, ''], ['2026-08-18', 95, 8, 'felt heavy but smooth, grip gave out on set three of the second round'], ['2026-08-25', 102.5, 9, '']];

async function seed(page) {
  for (const [date, w, r, note] of SESSIONS) {
    await page.click('#log-A-d1s1-0');
    await page.waitForSelector('#f-d');
    await page.fill('#f-d', date);
    await page.fill('input[aria-label^="Set 1 weight"]', String(w));
    await page.fill('input[aria-label^="Set 1 reps"]', String(r));
    if (note) await page.fill('input[placeholder^="Form"]', note);
    const check = page.locator('label.inline:has-text("Check off") input');
    if (await check.isChecked()) await check.uncheck();
    await page.click('button:has-text("Save set")');
    await expect(page.locator('#f-d')).toHaveCount(0);
  }
}
async function openDetail(page) {
  await page.click('#tab-progress');
  await page.getByRole('button', { name: 'Exercise charts' }).click();
  await page.locator('button.pcard').first().click();
  await expect(page.locator('.sheet table.hist tbody tr')).toHaveCount(SESSIONS.length);
}
const fit = page => page.evaluate(() => {
  const sheet = document.querySelector('.sheet'); const sr = sheet.getBoundingClientRect();
  const buttons = [...sheet.querySelectorAll('table.hist button')].map(b => b.getBoundingClientRect());
  const rows = [...sheet.querySelectorAll('table.hist tbody tr')].map(r => r.getBoundingClientRect());
  return { scroll: sheet.scrollWidth, client: sheet.clientWidth, overRight: Math.max(...buttons.map(b => b.right - sr.right)), minBtnH: Math.min(...buttons.map(b => b.height)), maxRowH: Math.max(...rows.map(r => r.height)), vh: innerHeight };
});

for (const [w, h] of [[390, 844], [360, 800], [320, 640]]) {
  test(`phone ${w}: the Detail sheet history fits the sheet and its Edit and delete buttons are on screen`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await seed(page);
    await openDetail(page);
    const m = await fit(page);
    expect(m.scroll).toBeLessThanOrEqual(m.client);
    expect(m.overRight).toBeLessThanOrEqual(0);
    expect(m.minBtnH).toBeGreaterThanOrEqual(44);
  });
}

test('phone 320 at 200% text: the history still fits the sheet and no entry is taller than the screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await seed(page);
  await page.addStyleTag({ content: 'html{font-size:200%!important}' });
  await openDetail(page);
  const m = await fit(page);
  expect(m.scroll).toBeLessThanOrEqual(m.client);
  expect(m.overRight).toBeLessThanOrEqual(0);
  expect(m.maxRowH).toBeLessThan(m.vh * 0.8); // a long note wraps in its own cell, not one letter per line
});

test('the delete button asks again inside the sheet on a phone, and confirming removes that entry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await openDetail(page);
  const first = page.locator('.sheet table.hist tbody tr').first();
  await first.getByRole('button', { name: /^Delete entry/ }).click();
  await expect(first).toHaveClass(/removing/); // the first tap arms it: the button now reads Delete?
  const m = await fit(page);
  expect(m.overRight).toBeLessThanOrEqual(0);
  await first.getByRole('button', { name: /^Delete\?/ }).click();
  await expect(page.locator('.sheet table.hist tbody tr')).toHaveCount(SESSIONS.length - 1);
});

test('a tablet keeps the plain table', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await seed(page);
  await openDetail(page);
  expect(await page.locator('.sheet table.hist').evaluate(t => getComputedStyle(t).display)).toBe('table');
  const m = await fit(page);
  expect(m.scroll).toBeLessThanOrEqual(m.client);
});

test('the Detail sheet has no accessibility violations on a phone, with the table roles set', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await openDetail(page);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
});
