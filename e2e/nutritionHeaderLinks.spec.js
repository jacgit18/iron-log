import { test, expect } from './fixtures.js';
import { openNutrition } from './nutritionBoardHelpers.js';

// Nutrition phone header option B (owner 2026-11-12): one week row with the dates, the add buttons, the day stepper, then a last row with the Manage link (the Targets link and the colour key were removed by brief targets-into-manage). What a unit test cannot catch: where the links sit on a phone, their tap size, and that they open the sheets.
const box = (page, sel) => page.locator(sel).evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, b: r.bottom, h: r.height, w: r.width }; });

for (const width of [375, 390]) {
  test(`at ${width} px the last row holds Manage as a link (44px tap area), no Targets link and no colour key; the week row has the dates; the Adding to line is not drawn; the sheet opens`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await openNutrition(page);
    const links = page.getByRole('group', { name: 'Nutrition settings' });
    await expect(links.getByRole('button')).toHaveCount(1); // Manage only
    await expect(page.getByRole('button', { name: 'What the colours mean' })).toHaveCount(0);
    await expect(page.locator('#nb-targets, #nb-legend, .wb-legend')).toHaveCount(0);
    await expect(page.locator('.nb-headbtns')).toHaveCount(0); // the week row holds only the week switcher
    expect(await page.locator('.nb-weekname').evaluate(e => getComputedStyle(e, '::after').content)).toMatch(/^" · [A-Z][a-z]{2} \d+ to /); // the dates share the row
    expect(await page.locator('.nb-weekname').evaluate(e => e.getBoundingClientRect().height)).toBeLessThan(40);
    await expect(page.locator('.nb-weeklab')).toContainText('This week · '); // still there for assistive tech
    expect(await page.locator('.nb-weeklab').evaluate(e => e.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    await expect(page.locator('.nb-target')).toHaveText('Adding to Thu 24 · today'); // read by a screen reader
    expect(await page.locator('.nb-target').evaluate(e => e.getBoundingClientRect().width)).toBeLessThanOrEqual(1); // not drawn: the day stepper names the day
    const step = await box(page, '.wdc'), m = await box(page, '#nb-manage'), col = await box(page, '.nb-col');
    expect(m.y).toBeGreaterThanOrEqual(step.b - 0.5);
    expect(m.x + m.w).toBeGreaterThan(width - 20); // right-aligned
    expect(m.h).toBeGreaterThanOrEqual(43.5);
    expect(col.y).toBeGreaterThan(m.y);
    await page.locator('#nb-manage').click();
    await expect(page.getByRole('dialog', { name: 'Manage' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
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
