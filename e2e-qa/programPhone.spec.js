import { expect, test } from '@playwright/test';
import { signInAs } from './persona.js';

// QA scenario S-72: on a 375 px screen the Program tab's Create a program button starts at the left, the switch beside it shows only A and B, and the
// row does not scroll sideways. The scenario names New user, but that account has no program (so no A and B switch); Heavy logger has both programs.
test('S-72: at 375 px Create a program starts at the left and the switch shows only A and B', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'heavy-logger', { viewport: { width: 375, height: 800 } });
  await page.click('#tab-program');
  await expect(page.locator('.edcols > .lib')).toBeAttached({ timeout: 30_000 });
  const button = page.locator('.edtop .createprog');
  await expect(button).toBeVisible();
  const seg = page.getByRole('group', { name: 'Program to edit' });
  expect((await seg.locator('button').allInnerTexts()).map(t => t.trim())).toEqual(['Program A', 'Program B']); // two buttons only, no other labels
  const { btn, segLeft, segRight } = await page.evaluate(() => {
    const b = document.querySelector('.edtop .createprog').getBoundingClientRect();
    const s = document.querySelector('.edtop [aria-label="Program to edit"]').getBoundingClientRect();
    return { btn: b.left, segLeft: s.left, segRight: s.right };
  });
  expect(btn === segLeft || btn >= segRight, `button at ${btn}, tabs ${segLeft} to ${segRight}`).toBe(true);
  expect(btn).toBeLessThan(segRight + 20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await context.close();
});
