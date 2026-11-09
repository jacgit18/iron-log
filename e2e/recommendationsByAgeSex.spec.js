import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSupplementEditor, openNutrition, openSupplementEditor, todayCol } from './nutritionBoardHelpers.js';

// Brief recommendations-by-age-sex, PR 2: the optional birth year and sex in Settings pick the person's own limit and recommended amount in the Totals sheet. The table, the bands and every fallback
// are node tests (lib/nutrientGroups.test.ts, lib/supplementTotalsProfile.test.ts, lib/profileEdit.test.ts); this covers the wiring a node test cannot: the Settings row, what the real sheet and the
// warning line say with and without a profile, a reload keeping it, Clear, and axe at 375 px in both themes. Open to everyone since 2026-11-09 (the `supplementTotals` flag is gone). The fixed clock is Thursday 2026-09-24.
const dialog = page => page.getByRole('dialog');
const profile = page => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('ironlog:config/main') || '{}').profile ?? null; } catch { return null; } });

const setProfile = async (page, year, sex) => {
  await page.locator('#tab-settings, #account-badge').first().click();
  await page.locator('#pr-year').fill(String(year));
  if (sex) await page.getByRole('radio', { name: sex, exact: true }).check();
};
async function takeCalcium(page, mg) {
  await page.locator('#tab-daily').click();
  await openNutrition(page);
  await openSupplementEditor(page);
  await page.locator('#suplib-new').click();
  await page.locator('#supp-name').fill('Calcium cap');
  await page.locator('#supp-add-nutrient').click();
  await page.getByLabel('Nutrient 1').selectOption({ label: 'Calcium' });
  await page.getByLabel('Amount 1').fill(String(mg));
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#sched-h')).toBeVisible();
  await closeSupplementEditor(page);
  await todayCol(page).getByLabel('Calcium cap', { exact: false }).first().check();
}

test.describe('admin session', () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true')); await page.reload(); });

  test('a person aged 52 is over the calcium limit at 2,200 mg and sees their own recommended amount; clearing the profile brings back the range', async ({ page }) => {
    await setProfile(page, 1974, 'Female');
    await takeCalcium(page, 2200);
    await expect(todayCol(page).locator('.nb-suppwarn')).toContainText('Over an upper limit today: Calcium');
    await todayCol(page).getByRole('button', { name: /^Totals for/ }).click();
    const s = dialog(page);
    await expect(s.locator('#stt-calcium')).toContainText('Over the limit for ages 51 to 70 by 200 mg');
    await expect(s.locator('#stt-calcium')).toContainText('Limit 2,000 mg for ages 51 to 70');
    await expect(s.locator('#stt-calcium')).toContainText('Recommended for women ages 51 to 70: 1,200 mg a day.');
    await expect(s.locator('#stt-profile')).toContainText('They do not cover pregnancy or breastfeeding');
    await s.getByRole('button', { name: 'Done' }).click();
    await page.locator('#tab-settings, #account-badge').first().click();
    await page.locator('#pr-clear').click();
    await expect(page.locator('#pr-year')).toHaveValue('');
    expect(await profile(page)).toBeNull();
    await page.locator('#tab-daily').click();
    await todayCol(page).getByRole('button', { name: /^Totals for/ }).click();
    await expect(dialog(page).locator('#stt-calcium')).toContainText('Recommended 1,000 to 1,200 mg a day');
    await expect(dialog(page).locator('#stt-profile')).toContainText('Add your birth year and sex in Settings');
  });

  test('the same 2,200 mg is only close to the limit at 40, and the profile survives a reload', async ({ page }) => {
    await setProfile(page, 1986, 'Male');
    await page.reload();
    await page.locator('#tab-settings, #account-badge').first().click();
    expect(await profile(page)).toEqual({ birthYear: 1986, sex: 'male' });
    await expect(page.locator('#pr-year')).toHaveValue('1986');
    await expect(page.getByRole('radio', { name: 'Male', exact: true })).toBeChecked();
    await takeCalcium(page, 2200);
    await expect(todayCol(page).locator('.nb-suppwarn')).toHaveCount(0);
    await todayCol(page).getByRole('button', { name: /^Totals for/ }).click();
    await expect(dialog(page).locator('#stt-calcium')).toContainText('Close to the limit (88%)');
    await expect(dialog(page).locator('#stt-calcium')).toContainText('Limit 2,500 mg for ages 19 to 50');
  });

  test('an unusable year is refused with a line beside the box, and a year under 19 is kept but the sheet says the age is not shown', async ({ page }) => {
    await setProfile(page, 85);
    await expect(page.locator('#pr-year-msg')).toContainText('four-digit year');
    expect(await profile(page)).toBeNull();
    await page.locator('#pr-year').fill('2012');
    await page.getByRole('radio', { name: 'Female', exact: true }).check();
    await expect(page.locator('#pr-year-msg')).toContainText('adult range is used');
    await takeCalcium(page, 2200);
    await todayCol(page).getByRole('button', { name: /^Totals for/ }).click();
    await expect(dialog(page).locator('#stt-profile')).toHaveText('Amounts for your age are not shown. The adult range is used.');
    await expect(dialog(page).locator('#stt-calcium')).toContainText('Limit 2,000 mg');
  });

  for (const scheme of ['light', 'dark']) {
    test(`the Settings row and the sheet with a profile pass axe in ${scheme} at 375 px with no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.emulateMedia({ colorScheme: scheme });
      await setProfile(page, 1974, 'Female');
      const row = await new AxeBuilder({ page }).include('section[aria-labelledby="pr-h"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(row.violations.map(v => v.id)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await takeCalcium(page, 800);
      await todayCol(page).getByRole('button', { name: /^Totals for/ }).click();
      const sheet = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(sheet.violations.map(v => v.id)).toEqual([]);
    });
  }
});

test('a person who is not an admin sees the profile row like everyone (released 2026-11-09)', async ({ page }) => {
  await page.locator('#tab-settings, #account-badge').first().click();
  await expect(page.locator('#pr-year')).toBeVisible();
});
