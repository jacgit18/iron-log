import { test, expect } from './fixtures.js';

// The colours button beside Help replaces the Appearance panel in Settings: one tap steps match this device, light, dark.
const theme = page => page.evaluate(() => document.documentElement.dataset.theme || 'system');
const boxes = async page => ({ help: await page.locator('#help-btn').boundingBox(), colours: await page.locator('#theme-btn').boundingBox() });

test('the colours button sits beside Help, steps the colours, and the choice survives a reload', async ({ page }) => {
  const btn = page.locator('#theme-btn');
  const { help, colours } = await boxes(page);
  expect(colours.x).toBeGreaterThanOrEqual(help.x + help.width); // to the right of Help, not on another row
  expect(Math.abs(colours.y + colours.height / 2 - (help.y + help.height / 2))).toBeLessThan(8);

  await expect(btn).toHaveAccessibleName('Colours: match this device. Switch to light');
  await btn.click();
  expect(await theme(page)).toBe('light');
  await expect(btn).toHaveAccessibleName('Colours: light. Switch to dark');
  await btn.click();
  expect(await theme(page)).toBe('dark');
  await expect(btn).toHaveAccessibleName('Colours: dark. Switch to match this device');

  await page.reload();
  expect(await theme(page)).toBe('dark');
  await expect(page.locator('#theme-btn')).toHaveAccessibleName('Colours: dark. Switch to match this device');
  await page.locator('#theme-btn').click();
  expect(await theme(page)).toBe('system');
});

test('on a phone both header buttons are on screen, 44px, and the page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const { help, colours } = await boxes(page);
  for (const b of [help, colours]) {
    expect(b.width).toBeGreaterThanOrEqual(44 - 1);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x + b.width).toBeLessThanOrEqual(360);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('at 320px and 200% text Help and the colours button wrap instead of leaving the screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addStyleTag({ content: 'html { font-size: 200% !important }' });
  await expect(page.locator('#theme-btn')).toBeVisible();
  const { help, colours } = await boxes(page);
  expect(help.x + help.width).toBeLessThanOrEqual(320);
  expect(colours.x + colours.width).toBeLessThanOrEqual(320);
});

test('Settings no longer has the Appearance panel but keeps Roomier text', async ({ page }) => {
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Appearance' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Text spacing' })).toBeVisible();
  const roomy = page.getByRole('checkbox', { name: /Roomier text/ });
  await roomy.check();
  expect(await page.evaluate(() => document.documentElement.dataset.spacing)).toBe('roomy');
  await roomy.uncheck();
  expect(await page.evaluate(() => document.documentElement.dataset.spacing || 'normal')).toBe('normal');
});
