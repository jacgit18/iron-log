import { expect, test } from '@playwright/test';
import { signInAs } from './persona.js';

// QA scenario S-72: on a 375 px screen the Program tab's header card has the A and B switch and no Create button, a gold + New program pill floats at the bottom right
// above the tab bar, and nothing scrolls sideways. The scenario names New user, but that account has no program (so no A and B switch); Heavy logger has both programs.
test('S-72: at 375 px the header card has the A and B switch and no Create button, and + New program floats above the tab bar', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'heavy-logger', { viewport: { width: 375, height: 800 } });
  await page.click('#tab-program');
  await expect(page.locator('.edcols > .edprog:not(.lib)')).toBeAttached({ timeout: 30_000 }); // the editor is drawn (the exercise library that used to be the signal moved to its own Exercises view)
  const card = page.getByRole('region', { name: 'Program you are editing' });
  await expect(card).toContainText('You are editing');
  const seg = card.getByRole('group', { name: 'Program to edit' });
  expect((await seg.locator('button').allInnerTexts()).map(t => t.trim())).toEqual(['Program A', 'Program B']); // two buttons only, no other labels
  await expect(card.getByRole('button', { name: 'Create a program' })).toBeHidden(); // a phone gets the pill instead
  const pill = page.getByRole('button', { name: '+ New program' });
  await expect(pill).toBeVisible();
  const box = await pill.boundingBox();
  const tabs = await page.locator('#tab-program').boundingBox();
  expect(box.x + box.width / 2, 'the pill is in the right half').toBeGreaterThan(375 / 2);
  expect(box.y + box.height, 'the pill is above the tab bar').toBeLessThanOrEqual(tabs.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await context.close();
});
