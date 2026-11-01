import { test, expect } from './fixtures.js';

// Program tab, Programs view: Create a program sits at the top beside the A | B switch, library rows say whether they are on the Board,
// and Copy this day to... copies the open day's cards onto another day, with Undo and Go to. A unit test cannot see where the controls sit
// or the notice, so these check the page.
const openPrograms = async page => {
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Programs', exact: true }).click();
  await expect(page.locator('#ed-title')).toBeVisible();
};
const rows = page => page.locator('.edpanel.edprog:not(.lib) .edrow');

test('Create a program is at the top, above the library, and still opens the sheet', async ({ page }) => {
  await openPrograms(page);
  const create = page.getByRole('button', { name: 'Create a program' });
  const top = await create.boundingBox(); const lib = await page.getByRole('heading', { name: 'Program library' }).boundingBox();
  expect(top.y).toBeLessThan(lib.y);
  // from 1280px (this run is 1440) it sits in the strip of program cards, below the switch; narrower it is in the top row (`programWide.spec.js`)
  await expect(page.locator('.progstrip').getByRole('button', { name: 'Create a program' })).toBeVisible();
  await create.click();
  await expect(page.getByRole('heading', { name: 'Create a program' })).toBeVisible();
});

test('a library row says whether it is on your Board', async ({ page }) => {
  await openPrograms(page);
  await page.getByRole('textbox', { name: /^Save Program A as/ }).fill('Kept copy');
  await page.getByRole('button', { name: 'Save a copy' }).click();
  await expect(page.locator('.lib .edrow', { hasText: 'Kept copy' })).toContainText('On your Board: Program A');
  await page.getByRole('group', { name: 'Program to edit' }).getByRole('button', { name: 'Program B' }).click();
  await expect(page.locator('.lib .edrow', { hasText: 'Kept copy' })).toContainText('On your Board: Program A');
});

test('Copy this day to another day, Undo and Go to', async ({ page }) => {
  await openPrograms(page);
  const n1 = await rows(page).count();
  expect(n1).toBeGreaterThan(0);
  await page.getByLabel('Copy this day to').selectOption('4');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  const note = page.getByRole('status').filter({ hasText: 'Copied' });
  await expect(note).toContainText(`Copied ${n1 === 1 ? '1 card' : n1 + ' cards'} from`);
  await expect(rows(page)).toHaveCount(n1); // the open day is unchanged
  await note.getByRole('button', { name: /^Go to/ }).click();
  const n4 = await rows(page).count();
  expect(n4).toBeGreaterThanOrEqual(n1);
  await page.getByRole('combobox', { name: 'Day to edit' }).selectOption('1');
  await page.getByLabel('Copy this day to').selectOption('4');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Copied' }).getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('combobox', { name: 'Day to edit' }).selectOption('4');
  await expect(rows(page)).toHaveCount(n4);
});

test('the Copy row fits a phone at large text, with 44px controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addStyleTag({ content: 'html{font-size:200%!important}' });
  await openPrograms(page);
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, w: innerWidth }));
  expect(m.scroll).toBeLessThanOrEqual(m.w);
  const hs = await page.locator('.copyday select, .copyday button, .edtop .createprog').evaluateAll(es => es.map(e => e.getBoundingClientRect().height));
  expect(hs.length).toBe(3);
  for (const h of hs) expect(h).toBeGreaterThanOrEqual(44);
});

test('the Copied notice is gone after leaving the Program tab and coming back', async ({ page }) => {
  await openPrograms(page);
  await page.getByLabel('Copy this day to').selectOption('4');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible();
  await page.click('#tab-daily');
  await openPrograms(page);
  await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toHaveCount(0);
});

// The Day stepper and day buttons are hands off: the Create button must not change where they sit (position with the button hidden = with it shown).
for (const [w, h] of [[375, 812], [1280, 800]]) {
  test(`the Create button does not move the Day controls at ${w} wide`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openPrograms(page);
    await page.evaluate(() => document.fonts.ready);
    const pos = () => page.locator('.daystep').boundingBox();
    const withBtn = await pos();
    await page.addStyleTag({ content: '.createprog{display:none!important}' });
    const without = await pos();
    expect(withBtn).toEqual(without);
  });
}
