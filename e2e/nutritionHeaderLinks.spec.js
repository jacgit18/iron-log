import { test, expect } from './fixtures.js';
import { openNutrition } from './nutritionBoardHelpers.js';

// Nutrition phone header option B (owner 2026-11-12): one week row with the dates and the small Manage button at its right end (brief nutrition-mobile-manage) (the Targets link and the colour key were removed by brief targets-into-manage). What a unit test cannot catch: where the links sit on a phone, their tap size, and that they open the sheets.
const box = (page, sel) => page.locator(sel).evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, b: r.bottom, h: r.height, w: r.width }; });

for (const width of [320, 375, 390, 430]) {
  test(`at ${width} px Manage is the small button at the right end of the week row (44px tap area), no Targets link and no colour key; the week row has the dates; the Adding to line is not drawn; the sheet opens`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await openNutrition(page);
    await expect(page.getByRole('group', { name: 'Nutrition settings' })).toHaveCount(0); // the links row is gone: Manage is in the week row
    await expect(page.locator('.nb-links')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'What the colours mean' })).toHaveCount(0);
    await expect(page.locator('#nb-targets, #nb-legend, .wb-legend')).toHaveCount(0);
    await expect(page.locator('.nb-headbtns')).toHaveCount(0); // the week row holds only the week switcher
    expect(await page.locator('.nb-weekname').evaluate(e => getComputedStyle(e, '::after').content)).toMatch(/^" · [A-Z][a-z]{2} \d+ to /); // the dates share the row
    expect(await page.locator('.nb-weekname').evaluate(e => e.getBoundingClientRect().height)).toBeLessThanOrEqual(44); // the name and dates may take two lines, never more than the 44px row
    await expect(page.locator('.nb-weeklab')).toContainText('This week · '); // still there for assistive tech
    expect(await page.locator('.nb-weeklab').evaluate(e => e.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    await expect(page.locator('.nb-target')).toHaveText('Adding to Thu 24 · today'); // read by a screen reader
    expect(await page.locator('.nb-target').evaluate(e => e.getBoundingClientRect().width)).toBeLessThanOrEqual(1); // not drawn: the day stepper names the day
    const card = await box(page, '.wdc'), w = await box(page, '.nb-weeksw'), m = await box(page, '#nb-manage'), col = await box(page, '.nb-col');
    expect(m.y).toBeGreaterThanOrEqual(card.y - 0.5);
    expect(m.b).toBeLessThanOrEqual(card.b + 0.5); // inside the joined card
    expect(Math.abs((w.y + w.h / 2) - (m.y + m.h / 2))).toBeLessThan(1); // on the switcher's row
    expect(w.x + w.w).toBeLessThanOrEqual(m.x + 0.5); // the switcher shrinks and sits left of Manage
    expect(m.x + m.w).toBeGreaterThan(card.x + card.w - 12); // right end of the card
    expect(card.x + card.w).toBeGreaterThan(width - 24);
    expect(m.h).toBeGreaterThanOrEqual(43.5);
    expect(await page.locator('#nb-manage').evaluate(e => e.className)).toContain('btn');
    expect(col.y).toBeGreaterThan(m.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.locator('#nb-manage').click();
    await expect(page.getByRole('dialog', { name: 'Manage' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

for (const width of [320, 430]) {
  test(`at ${width} px on another week the dates and This week fit, Manage stays inside the card, and large text moves Manage to its own line without leaving the card`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await openNutrition(page);
    await page.getByRole('button', { name: 'Next week' }).click();
    await expect(page.getByRole('button', { name: 'This week', exact: true })).toBeVisible();
    const inside = async () => {
      const card = await box(page, '.wdc'), m = await box(page, '#nb-manage'), w = await box(page, '.nb-weekname');
      expect(m.x).toBeGreaterThanOrEqual(card.x - 0.5);
      expect(m.x + m.w).toBeLessThanOrEqual(card.x + card.w + 0.5);
      expect(w.w).toBeGreaterThan(60); // the name keeps room, never a letter per line
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    };
    await inside();
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await inside();
    await page.locator('#nb-manage').click();
    await expect(page.getByRole('dialog', { name: 'Manage' })).toBeVisible();
  });
}

test('above 700 px the Manage button stays on the week row beside the switcher, there is no links row and no colour key', async ({ page }) => {
  await page.setViewportSize({ width: 701, height: 900 });
  await openNutrition(page);
  await expect(page.locator('.nb-links')).toHaveCount(0);
  await expect(page.locator('.wb-legend')).toHaveCount(0); // the colour key was removed
  await expect(page.locator('#nb-targets')).toHaveCount(0);
  await expect(page.locator('.nb-target')).toBeVisible();
  const w = await box(page, '.nb-weeksw'), m = await box(page, '#nb-manage');
  expect(Math.abs(w.y - m.y)).toBeLessThan(1);
  await expect(page.locator('#nb-manage')).toHaveClass(/btn/);
});
