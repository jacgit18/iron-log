import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Seeded-data audit 2026-11-01: two axe failures only showed with data. The weight-goal Remove buttons carried a name that did not contain their visible
// text ("Any phase goal" for "Remove"), and the level-3 heat cells were white on the mid-tone fill (3.5:1 in the light theme, 4.5:1 needed).
// The heatmap is aria-hidden, which axe still checks for contrast. A seed with one lift goal and several heavy weeks puts both on screen.
test.use({ viewport: { width: 1100, height: 900 } });

const seed = async page => {
  await page.evaluate(() => {
    const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
    // 12 sets a week on a lat exercise puts its muscle at level 3 (10 to 20 sets).
    const entries = [7, 14, 21, 28, 35].map(n => ({ d: day(n), ph: 'hyp', w: 100, s: 12, r: 8 }));
    localStorage.setItem('ironlog:logs/latpd', JSON.stringify({ schema: 1, entries }));
    const cfg = JSON.parse(localStorage.getItem('ironlog:config/main') || '{}');
    localStorage.setItem('ironlog:config/main', JSON.stringify({ ...cfg, liftGoals: { latpd: { any: { w: 150 } } } }));
  });
  await page.reload();
};

for (const scheme of ['light', 'dark']) {
  test(`weight-goal Remove names start with their text and heat cells keep their contrast (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await seed(page);
    await page.evaluate(() => { location.hash = '#/progress/goals'; });
    const remove = page.locator('.goalspanel .goalitem .actions button', { hasText: 'Remove' });
    await expect(remove.first()).toBeVisible();
    for (const name of await remove.evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')))) expect(name).toMatch(/^Remove /);

    await page.evaluate(() => { location.hash = '#/progress/trends'; });
    await expect(page.locator('.heat .hc.l3').first()).toBeAttached();
    const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast', 'label-content-name-mismatch']).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  });
}
