import { test as base, expect } from '@playwright/test';

// A fixed Thursday (week of Sun Sep 20 2026) and a clean, tip-free app, so every test starts from the same board.
const NOW = new Date('2026-09-24T18:30:00-04:00');

export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.addInitScript(() => { localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); });
    await page.clock.install({ time: NOW });
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => {});
    await provide(page);
  },
});
// Entries on the workout Experiments list, in place before the next page load (the Program tab no longer has a button that makes them).
export const seedExperiments = (page, exercises = ['hack']) => page.addInitScript(items => {
  localStorage.setItem('ironlog:experiments/main', JSON.stringify({ schema: 1, items }));
}, exercises.map((ex, i) => ({ id: 'E' + i, ex, ph: 'hyp', note: '' })));
export { expect };
