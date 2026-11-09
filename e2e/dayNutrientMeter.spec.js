import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSupplementEditor, openNutrition, openSupplementEditor, todayCol } from './nutritionBoardHelpers.js';

// Brief vitamin-mineral-day-meter (layout B): vitamins and minerals under a day's Supplements meter, open to everyone since 2026-11-09. Which nutrient is nearest its limit, ties, food and every
// status word are node tests (lib/dayNutrientMeter.test.ts, over the same rows the sheet draws); this covers the wiring a node test cannot: the closed line and the open bars on the real board,
// ticking moving it, "Totals" opening the sheet, a person who is not an admin seeing it too, and axe at 375 px in both themes. The fixed clock is Thursday 2026-09-24.
const dialog = page => page.getByRole('dialog');

async function addSupplement(page, name, nutrient, amount) {
  await page.locator('#suplib-new').click();
  await page.locator('#supp-name').fill(name);
  await page.locator('#supp-add-nutrient').click();
  await page.getByLabel('Nutrient 1').selectOption({ label: nutrient });
  await page.getByLabel('Amount 1').fill(String(amount));
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#sched-h')).toBeVisible();
}
async function setUp(page) {
  await openNutrition(page);
  await openSupplementEditor(page);
  await addSupplement(page, 'D cap', 'Vitamin D', 112);
  await addSupplement(page, 'Zinc cap', 'Zinc', 35);
  await addSupplement(page, 'Mag cap', 'Magnesium', 217);
  await closeSupplementEditor(page);
}

test.describe('admin session', () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true')); await page.reload(); });

  test('nothing ticked says so, ticking names the two nearest their limits, and a tap opens the bars', async ({ page }) => {
    await setUp(page);
    const col = todayCol(page);
    await expect(col.locator('.nb-vit-none')).toHaveText('Vitamins and minerals: nothing ticked yet');
    for (const n of ['D cap', 'Zinc cap', 'Mag cap']) await col.getByLabel(n, { exact: false }).first().check();
    const tog = col.locator('.nb-vit-tog');
    await expect(tog).toContainText('Vitamin D over · Zinc 88%'); // vitamin D 112 of 100 mcg, zinc 35 of 40 mg; magnesium 62% is not named
    await expect(tog).toHaveAttribute('aria-expanded', 'false');
    await expect(col.locator('.nb-vit-list')).toHaveCount(0);
    await tog.click();
    await expect(tog).toHaveAttribute('aria-expanded', 'true');
    await expect(col.locator('.nb-vit-sub')).toHaveCount(3);
    await expect(col.getByRole('img', { name: /^Vitamin D: 112 mcg\. Over the limit by 12 mcg/ })).toBeVisible();
    await expect(col.getByRole('img', { name: /^Magnesium: 217 mg\. 62% of the limit/ })).toBeVisible();
    await tog.click();
    await expect(col.locator('.nb-vit-list')).toHaveCount(0);
  });

  test('unticking moves the line, and "Open Totals" opens that day\'s sheet', async ({ page }) => {
    await setUp(page);
    const col = todayCol(page);
    await col.getByLabel('Mag cap', { exact: false }).first().check();
    await expect(col.locator('.nb-vit-tog')).toContainText('Magnesium 62%');
    await col.getByLabel('Zinc cap', { exact: false }).first().check();
    await expect(col.locator('.nb-vit-tog')).toContainText('Zinc 88% · Magnesium 62%');
    await col.locator('.nb-vit-tog').click();
    await col.getByRole('button', { name: 'Open Totals' }).click();
    await expect(dialog(page).locator('#stt-zinc')).toContainText('88%');
  });

  for (const scheme of ['light', 'dark']) {
    test(`the open list passes axe in ${scheme} at 375 px with no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.emulateMedia({ colorScheme: scheme });
      await setUp(page);
      const col = todayCol(page);
      for (const n of ['D cap', 'Zinc cap', 'Mag cap']) await col.getByLabel(n, { exact: false }).first().check();
      await col.locator('.nb-vit-tog').click();
      const scan = await new AxeBuilder({ page }).include('.nb-vit').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(scan.violations.map(v => v.id)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
});

test('a person who is not an admin sees the line like everyone (released 2026-11-09)', async ({ page }) => {
  await setUp(page); // no admin session
  const col = todayCol(page);
  await col.getByLabel('Mag cap', { exact: false }).first().check();
  await expect(col.locator('.nb-vit-tog')).toContainText('Magnesium 62%');
});
