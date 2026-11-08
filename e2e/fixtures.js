import { test as base, expect } from '@playwright/test';

// Grocery row details open by default above 700 px (brief groceries-store-chips-owes) and these specs run at 1440 px, so they keep the closed rows they were written for; e2e/groceryStoreChips.spec.js stores 'auto' to test the default.
// Recipes open a recipe as a page above 1280 px unless told otherwise, and the Filters disclosure is open, since these specs run at 1440 px and were written for the page and the open filter rows (brief recipes-find-type-tabs); e2e/recipesTypeTabs.spec.js stores 'auto' and 'closed' to test the pane and the closed default.
// A fixed Thursday (week of Sun Sep 20 2026) and a clean, tip-free app (the Program tab's first-time guide is off too; programTabClarity.spec.js turns it on), so every test starts from the same board.
const NOW = new Date('2026-09-24T18:30:00-04:00');

export const test = base.extend({
  page: async ({ page }, provide) => {
    // A built file the app asks for must exist: a 404 under /assets/ means a chunk or stylesheet went missing from the build.
    const missing = [];
    page.on('response', r => { if (r.status() === 404 && new URL(r.url()).pathname.includes('/assets/')) missing.push(r.url()); });
    await page.addInitScript(() => { localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); localStorage.setItem('ironlog:hideprogramguide', '1'); if (localStorage.getItem('ironlog:sort:grocery-details') === null) localStorage.setItem('ironlog:sort:grocery-details', 'closed'); if (localStorage.getItem('ironlog:sort:recipes-detail') === null) localStorage.setItem('ironlog:sort:recipes-detail', 'closed'); if (localStorage.getItem('ironlog:sort:recipes-filters') === null) localStorage.setItem('ironlog:sort:recipes-filters', 'open'); });
    await page.clock.install({ time: NOW });
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => {});
    await provide(page);
    expect(missing, 'built files the app asked for that are not in the build').toEqual([]);
  },
});
// Entries on the workout Experiments list, in place before the next page load (the Program tab no longer has a button that makes them).
export const seedExperiments = (page, exercises = ['hack']) => page.addInitScript(items => {
  localStorage.setItem('ironlog:experiments/main', JSON.stringify({ schema: 1, items }));
}, exercises.map((ex, i) => ({ id: 'E' + i, ex, ph: 'hyp', note: '' })));
// Done and skipped cards are folded into a closed "Finished (N)" bar below the day's open cards; open it (once) and return the row list.
export const openFinished = async (page, day = 1) => {
  const bar = page.locator(`#finished-bar-${day}`);
  await expect(bar).toBeVisible();
  if ((await bar.getAttribute('aria-expanded')) !== 'true') await bar.click();
  const list = page.locator(`#finished-list-${day}`);
  await expect(list).toBeVisible();
  return list;
};
export { expect };
