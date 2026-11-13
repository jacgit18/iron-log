import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// The phone Stretches tab: a stretch is one line (tick box beside its name), the summary lives in the progress line,
// and Skip day folds behind a ⋯ in the day header (a skipped day keeps it shown, since Undo skip is its main action).
const open = async page => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByText('Stretches', { exact: true }).first().click();
  await expect(page.locator('.col.sel article.card').first()).toBeVisible();
};

test('a stretch row is one line: the tick box sits beside the name', async ({ page }) => {
  await open(page);
  const row = page.locator('.col.sel .strrow').first();
  const box = await row.locator('input.chk').boundingBox();
  const name = await row.locator('.exh').boundingBox();
  expect(Math.abs((box.y + box.height / 2) - (name.y + name.height / 2))).toBeLessThan(12);
  expect(name.x).toBeGreaterThan(box.x);
});

test('there is no progress line and no separate summary box (the day tabs carry the counts)', async ({ page }) => {
  await open(page);
  await expect(page.locator('.strroot .progress')).toHaveCount(0);
  await expect(page.locator('.bwrow')).toHaveCount(0);
});

test('Skip day is in a floating menu under the day header ⋯ at the right end; nothing shifts; it closes on Escape and outside tap', async ({ page }) => {
  await open(page);
  const col = page.locator('.col.sel');
  const dots = col.locator('.daymore');
  const item = col.locator('.daypop button');
  await expect(item).toBeHidden();
  await expect(col.locator('.addrow')).toHaveCount(0); // no extra row on a phone: only the menu's Skip day is rendered
  const vw = page.viewportSize().width;
  const box = await dots.boundingBox();
  expect(box.x + box.width, '⋯ sits at the right end of the header').toBeGreaterThan(vw - 30);
  expect(box.width).toBeGreaterThanOrEqual(44);
  const h0 = (await col.boundingBox()).height;
  await dots.click();
  await expect(item).toBeVisible();
  await expect(item).toBeFocused();
  await expect(dots).toHaveAttribute('aria-expanded', 'true');
  expect((await col.boundingBox()).height, 'the menu floats: the day does not grow').toBe(h0);
  await page.keyboard.press('Escape');
  await expect(item).toBeHidden();
  await expect(dots).toBeFocused();
  await dots.click();
  await page.mouse.click(5, 300); // outside tap
  await expect(item).toBeHidden();
  await dots.click();
  await page.keyboard.press('Tab'); // tabbing out of the menu closes it
  await expect(item).toBeHidden();
  await dots.click();
  await page.locator('.wdc-tabs [role=tab]').nth(1).click(); // picking another day closes it
  await expect(page.locator('.daypop:visible')).toHaveCount(0);
  await dots.click();
  await item.click(); // Skip day closes the menu and puts focus back on ⋯
  await expect(col.locator('.colhead .count')).toHaveText('Skipped');
  await expect(item).toBeHidden();
  await expect(dots).toBeFocused();
  await dots.click();
  await expect(item).toHaveText('Undo skip');
  await item.click();
  await expect(col.locator('.colhead .count')).toHaveCount(0);
});

test('the phone Stretches tab has no accessibility violations', async ({ page }) => {
  await open(page);
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations).toEqual([]);
});
