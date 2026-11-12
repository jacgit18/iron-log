import { test, expect } from './fixtures.js';
import { openNutrition } from './nutritionBoardHelpers.js';

// Nutrition header option C (owner 2026-11-12). What a unit test cannot catch: where the links sit on a phone, their tap size, and that they open the sheets.
const box = (page, sel) => page.locator(sel).evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, b: r.bottom, h: r.height }; });

for (const width of [375, 390]) {
  test(`at ${width} px Targets and Manage are text links in one row under the day stepper, each with a 44px tap area, and they open their sheets`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await openNutrition(page);
    const links = page.getByRole('group', { name: 'Nutrition settings' });
    await expect(links.getByRole('button')).toHaveCount(2);
    await expect(page.locator('.nb-headbtns')).toHaveCount(0); // the week row holds only the week switcher
    const step = await box(page, '.nb-step'), t = await box(page, '#nb-targets'), m = await box(page, '#nb-manage'), col = await box(page, '.nb-col');
    expect(t.y).toBeGreaterThanOrEqual(step.b - 0.5);
    expect(Math.abs(t.y - m.y)).toBeLessThan(1);
    expect(t.x).toBeLessThan(20); // left-aligned
    expect(Math.min(t.h, m.h)).toBeGreaterThanOrEqual(43.5);
    expect(col.y).toBeGreaterThan(m.y);
    await expect(page.locator('#nb-targets')).toHaveAccessibleName('Targets and goal');
    await page.locator('#nb-targets').click();
    await expect(page.getByRole('dialog', { name: 'Targets and goal' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('#nb-manage').click();
    await expect(page.getByRole('dialog', { name: 'Manage' })).toBeVisible();
  });
}

test('above 700 px the buttons stay on the week row beside the switcher and there is no links row', async ({ page }) => {
  await page.setViewportSize({ width: 701, height: 900 });
  await openNutrition(page);
  await expect(page.locator('.nb-links')).toHaveCount(0);
  const w = await box(page, '.nb-weeksw'), t = await box(page, '#nb-targets'), m = await box(page, '#nb-manage');
  expect(Math.abs(w.y - t.y)).toBeLessThan(1);
  expect(Math.abs(t.y - m.y)).toBeLessThan(1);
  await expect(page.locator('#nb-targets')).toHaveClass(/btn/);
});
