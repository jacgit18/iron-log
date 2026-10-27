import { test, expect } from './fixtures.js';

const title = page => page.getByRole('button', { name: 'Loadbearer' });

test('the app title goes back to the Board from any tab', async ({ page }) => {
  for (const tab of ['program', 'progress', 'daily']) {
    await page.click(`#tab-${tab}`);
    await expect(page.locator(`#tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
    await title(page).click();
    await expect(page.locator('#tab-board')).toHaveAttribute('aria-selected', 'true');
  }
});

test('the title works from the keyboard and marks the Board as the current page', async ({ page }) => {
  await page.click('#tab-program');
  await expect(title(page)).not.toHaveAttribute('aria-current', 'page');
  await title(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#tab-board')).toHaveAttribute('aria-selected', 'true');
  await expect(title(page)).toHaveAttribute('aria-current', 'page');
});

test('the title still reads as the heading on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { level: 1, name: 'Loadbearer' })).toBeVisible();
});
