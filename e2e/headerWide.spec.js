import { test, expect } from './fixtures.js';

// The light theme keeps the page header charcoal (HeaderDark.css). Above the 1920px page cap that band must run to the screen edges,
// while the header's content stays inside the capped container. The dark theme has no band: the header is transparent on the page.
for (const scheme of ['light', 'dark']) {
  for (const width of [1280, 1920, 2560]) {
    test(`${scheme} ${width}px: header band reaches the screen edges, content stays in the 1920px container`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      const m = await page.evaluate(() => {
        const r = e => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, width: b.width }; };
        const header = document.querySelector('header.top');
        const cs = getComputedStyle(header);
        const band = getComputedStyle(header, '::before'); // the band beyond the container is the header's ::before
        const spread = parseFloat((band.boxShadow.match(/(\d+(?:\.\d+)?)px(?!.*px)/) || [0, 0])[1]);
        return {
          vw: document.documentElement.clientWidth, header: r(header), wrap: r(document.querySelector('.wrap')), tabs: r(document.querySelector('.tabs')),
          bg: cs.backgroundColor, shadow: band.boxShadow, content: band.content, spread, over: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      expect(m.wrap.width).toBeLessThanOrEqual(1920);
      expect(m.tabs.right).toBeLessThanOrEqual(m.wrap.right);
      expect(m.over, 'sideways scroll').toBeLessThanOrEqual(0);
      if (scheme === 'light') {
        expect(m.bg).toBe('rgb(30, 35, 38)');
        expect(m.shadow).toContain(m.bg);
        expect(m.header.left - m.spread, 'band left edge').toBeLessThanOrEqual(0);
        expect(m.header.right + m.spread, 'band right edge').toBeGreaterThanOrEqual(m.vw);
      } else {
        expect(m.bg).toBe('rgba(0, 0, 0, 0)');
        expect(m.shadow).toBe('none');
        expect(m.content).toBe('none');
      }
    });
  }
}
