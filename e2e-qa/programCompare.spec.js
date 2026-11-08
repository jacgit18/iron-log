import { expect, test } from '@playwright/test';
import { signInAs } from './persona.js';

// QA scenario S-67: a day empty on both sides says so, a day with exercises on one side lists them as "Not in this program" on the other, and the section
// is closed again after leaving the Program tab and coming back. The scenario names New user, who has no Program A, so this uses Heavy logger and makes
// two blank programs to compare (a blank against Program A is the one-sided day). It runs on a phone: from 700 px Compare is a view that is always open,
// so the closing section (and the + New program pill that makes a program there) exist only at phone width.
const makeBlank = async (page, name) => {
  await page.getByRole('button', { name: 'Programs', exact: true }).click();
  await page.getByRole('button', { name: '+ New program' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('radio', { name: /blank/i }).check();
  await sheet.getByLabel('Name').fill(name);
  await sheet.getByRole('button', { name: 'Create', exact: true }).click();
  await sheet.getByRole('button', { name: /^Not yet/ }).click();
};

test('S-67: an empty day, a one-sided day, and the section closing again', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'heavy-logger', { viewport: { width: 375, height: 800 } });
  await page.click('#tab-program');
  await expect(page.locator('.edcols > .edprog:not(.lib)')).toBeAttached({ timeout: 30_000 }); // the editor is drawn (the exercise library that used to be the signal moved to its own Exercises view)
  await makeBlank(page, 'Blank one');
  await page.click('#tab-program');
  await makeBlank(page, 'Blank two');
  await page.click('#tab-program');
  const toggle = page.getByRole('button', { name: 'Compare programs' });
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  const body = page.locator('.cmpbody');
  await expect(body).toBeVisible();
  const day = n => body.getByRole('group', { name: 'Compare day' }).getByRole('button', { name: new RegExp(`^(Day )?${n}\\b`) }).first();
  // Two blank programs: any single day is empty on both sides.
  await body.getByLabel('First program').selectOption({ label: 'Blank one' });
  await body.getByLabel('Second program').selectOption({ label: 'Blank two' });
  await day(2).click();
  await expect(body.getByRole('status')).toHaveText('Nothing on this day in either program.');
  // A blank against Program A: the day exists on one side only.
  await body.getByLabel('First program').selectOption('A');
  await expect(body.getByText('Not in this program').first()).toBeVisible();
  // Leave the Program tab and come back: the section is closed again.
  await page.click('#tab-daily');
  await page.click('#tab-program');
  await expect(page.getByRole('button', { name: 'Compare programs' })).toHaveAttribute('aria-expanded', 'false');
  await context.close();
});
