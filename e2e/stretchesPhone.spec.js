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

test("today's tally is in the progress line, and there is no separate summary box", async ({ page }) => {
  await open(page);
  await expect(page.locator('.progress [role="status"]')).toContainText(/days done · Today \d+ of \d+/);
  await expect(page.locator('.bwrow')).toHaveCount(0);
});

test('Skip day is behind the day header ⋯ on a phone, and a skipped day keeps Undo skip in view', async ({ page }) => {
  await open(page);
  const skip = page.locator('.col.sel .addrow button');
  await expect(skip).toBeHidden();
  await page.locator('.col.sel .daymore').click();
  await expect(skip).toBeVisible();
  await skip.click();
  await page.locator('.col.sel .daymore').click(); // fold it: a skipped day still shows Undo skip
  await expect(skip).toHaveText('Undo skip');
  await expect(skip).toBeVisible();
  await skip.click();
  await expect(skip).toBeHidden();
});

test('the phone Stretches tab has no accessibility violations', async ({ page }) => {
  await open(page);
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations).toEqual([]);
});
