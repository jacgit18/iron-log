import { test, expect } from './fixtures.js';

// One heading scale (--h-page, --h-section, --h-sub, --h-label). The computed size of a real heading on a screen must equal the token, and the page title steps down only by changing --h-page.
const size = (page, sel) => page.evaluate((s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize), sel);
const token = (page, name) => page.evaluate((n) => {
  const probe = document.createElement('span');
  probe.style.fontSize = `var(${n})`;
  document.body.append(probe);
  const px = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  return px;
}, name);

test('the four heading tokens are the agreed sizes', async ({ page }) => {
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(await token(page, '--h-section')).toBeCloseTo(1.375 * rem, 1);
  expect(await token(page, '--h-sub')).toBeCloseTo(1.125 * rem, 1);
  expect(await token(page, '--h-label')).toBeCloseTo(0.75 * rem, 1);
});

test('the page title follows --h-page on a desktop and on a phone', async ({ page }) => {
  for (const [w, h] of [[1280, 800], [375, 812]]) {
    await page.setViewportSize({ width: w, height: h });
    expect(await size(page, 'header.top h1'), `${w}px`).toBeCloseTo(await token(page, '--h-page'), 1);
  }
});

test('Settings panel headings use the section size and the .label class is the label size', async ({ page }) => {
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await expect(page.locator('.settings .panel h3').first()).toBeVisible();
  expect(await size(page, '.settings .panel h3')).toBeCloseTo(await token(page, '--h-section'), 1);
  const label = await page.evaluate(() => {
    const el = document.createElement('p');
    el.className = 'label';
    el.textContent = 'Label';
    document.body.append(el);
    const cs = getComputedStyle(el);
    const out = { size: parseFloat(cs.fontSize), upper: cs.textTransform };
    el.remove();
    return out;
  });
  expect(label.size).toBeCloseTo(await token(page, '--h-label'), 1);
  expect(label.upper).toBe('uppercase');
});
