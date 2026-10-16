import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Text is sized in rem, so a larger default font size (a browser or system setting, simulated here by a bigger root size) scales the
// whole app. Two checks per tab: the page never scrolls sideways (WCAG 1.4.10), and the fixed tab bar never sits on the last content.
const TABS = ['board', 'daily', 'progress', 'program', 'settings'];
const setRoot = (page, pct) => page.addStyleTag({ content: `html{font-size:${pct}%}` });

for (const [width, pct] of [[390, 150], [390, 200], [320, 150], [320, 200]]) {
  test(`at ${pct}% text and ${width}px wide no tab scrolls sideways and the tab bar leaves the last content clear`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await setRoot(page, pct);
    for (const t of TABS) {
      await page.locator(`#tab-${t}, #account-badge`).first().click();
      await expect(page.locator('#view .view-loading')).toHaveCount(0); // a tab that loads on first use is measured once it is there, not 150 ms after the click
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${t}: sideways overflow`).toBeLessThanOrEqual(0);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const gap = await page.evaluate(() => document.querySelector('.tabs').getBoundingClientRect().top - document.getElementById('view').getBoundingClientRect().bottom);
      expect(gap, `${t}: tab bar covers the last content`).toBeGreaterThanOrEqual(0);
    }
  });
}

test('body text follows the root size and the page padding follows the tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const size = () => page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  const bar = () => page.evaluate(() => ({ h: document.querySelector('.tabs').getBoundingClientRect().height, v: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tabbar')) }));
  expect(await size()).toBe(15); // the normal 16px root: unchanged look
  const normal = await bar();
  await setRoot(page, 200);
  expect(await size()).toBe(30);
  await page.waitForTimeout(150);
  const big = await bar();
  expect(big.h).toBeGreaterThan(normal.h); // the labels wrap to a second row
  expect(big.v).toBeGreaterThanOrEqual(big.h - 1); // and the space reserved for the bar grew with it
});

test('there is no accessibility violation at 150% text on any tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setRoot(page, 150);
  for (const t of TABS) {
    await page.click(`#tab-${t}`);
    await page.waitForTimeout(200);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map(v => `${t} ${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  }
});

test('with reduced motion on, transitions, animations and smooth scrolling are off', async ({ page }) => {
  // The elements that animate: the dragged row's neighbours, the timer bar's fill, and a stand-in for any keyframe animation.
  const probe = () => page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<div id="p1" class="edrow shifting"></div><div class="tb-bar"><i id="p2"></i></div><div id="p3" style="animation:spin 1s infinite"></div>');
    const cs = id => getComputedStyle(document.getElementById(id));
    return { shift: cs('p1').transitionDuration, fill: cs('p2').transitionDuration, anim: cs('p3').animationName, scroll: getComputedStyle(document.documentElement).scrollBehavior };
  });
  await page.click('#tab-program'); // the editor's row styles load with the Program tab
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const on = await probe();
  expect(on.shift).toBe('0.15s');
  expect(on.fill).toBe('0.25s');
  expect(on.anim).toBe('spin');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => ['p1', 'p2', 'p3'].map(id => getComputedStyle(document.getElementById(id)).transitionDuration + '|' + getComputedStyle(document.getElementById(id)).animationName))).toEqual(['0s|none', '0s|none', '0s|none']);
  expect((await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior))).toBe('auto');
});
