import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

for (const [name, tab] of [['board', null], ['progress', '#tab-progress'], ['program editor', '#tab-program'], ['body', '#tab-body']]) {
  test(`${name} has no accessibility violations`, async ({ page }) => {
    if (tab) { await page.click(tab); await page.waitForTimeout(300); }
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  });
}
