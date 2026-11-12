import { test, expect } from './fixtures.js';
import { openNutrition } from './nutritionBoardHelpers.js';

// Nutrition phone header option B (owner 2026-11-12): one week row with the dates, the add buttons, the day stepper, then a last row of Targets · Manage and a colour-key link. What a unit test cannot catch: where the links sit on a phone, their tap size, and that they open the sheets.
const box = (page, sel) => page.locator(sel).evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, b: r.bottom, h: r.height }; });

for (const width of [375, 390]) {
  test(`at ${width} px the last row holds Targets and Manage as links (44px tap areas) and the colour key link; the week row has the dates; the Adding to line is not drawn; both sheets open`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await openNutrition(page);
    const links = page.getByRole('group', { name: 'Nutrition settings' });
    await expect(links.getByRole('button')).toHaveCount(3); // Targets, Manage, What the colours mean
    await expect(page.locator('.nb-headbtns')).toHaveCount(0); // the week row holds only the week switcher
    expect(await page.locator('.nb-weekname').evaluate(e => getComputedStyle(e, '::after').content)).toMatch(/^" · [A-Z][a-z]{2} \d+ to /); // the dates share the row
    expect(await page.locator('.nb-weekname').evaluate(e => e.getBoundingClientRect().height)).toBeLessThan(40);
    await expect(page.locator('.nb-weeklab')).toContainText('This week · '); // still there for assistive tech
    expect(await page.locator('.nb-weeklab').evaluate(e => e.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    await expect(page.locator('.nb-target')).toHaveText('Adding to Thu 24 · today'); // read by a screen reader
    expect(await page.locator('.nb-target').evaluate(e => e.getBoundingClientRect().width)).toBeLessThanOrEqual(1); // not drawn: the day stepper names the day
    const step = await box(page, '.nb-step'), t = await box(page, '#nb-targets'), m = await box(page, '#nb-manage'), col = await box(page, '.nb-col');
    expect(t.y).toBeGreaterThanOrEqual(step.b - 0.5);
    expect(Math.abs(t.y - m.y)).toBeLessThan(1);
    expect(t.x).toBeLessThan(20); // left-aligned
    expect(Math.min(t.h, m.h)).toBeGreaterThanOrEqual(43.5);
    expect(col.y).toBeGreaterThan(m.y);
    const key = page.getByRole('button', { name: 'What the colours mean' }), legend = page.locator('#nb-legend'), kb = await key.boundingBox();
    expect(kb.y + kb.height / 2).toBeGreaterThan(t.y); expect(kb.x).toBeGreaterThan(width / 2); expect(kb.height).toBeGreaterThanOrEqual(43.5); // right end of the last row
    await expect(key).toHaveAttribute('aria-expanded', 'false');
    await expect(legend).toBeHidden();
    await key.click();
    await expect(key).toHaveAttribute('aria-expanded', 'true');
    await expect(legend).toBeVisible();
    await expect(legend).not.toHaveAttribute('aria-hidden', 'true'); // opened on request, so a screen reader reaches it
    expect((await legend.boundingBox()).y).toBeGreaterThan(m.b - 1); // inline under the last row
    await key.click();
    await expect(legend).toBeHidden();
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
  await expect(page.locator('.wb-legend')).toBeVisible(); // the colour key is always shown above 700 px
  await expect(page.locator('.nb-target')).toBeVisible();
  const w = await box(page, '.nb-weeksw'), t = await box(page, '#nb-targets'), m = await box(page, '#nb-manage');
  expect(Math.abs(w.y - t.y)).toBeLessThan(1);
  expect(Math.abs(t.y - m.y)).toBeLessThan(1);
  await expect(page.locator('#nb-targets')).toHaveClass(/btn/);
});
