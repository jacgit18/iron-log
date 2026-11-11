import { expect, test } from '@playwright/test';
import { addOneOff, closeSheet, eaten, meter, openAdd, openNutrition, todayCol } from './nutritionBoard.js';
import { signInAs } from './persona.js';

// QA scenario S-02 (Diet, over target): today reads about 120% of the calories with the protein short; at 20 entries a 21st one-off food is refused and Quick
// add shows a message in place of its choices, and deleting one brings Quick add back.
test('S-02: over target on open, and the 20-entries-a-day limit replaces the add form', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'diet-over-target');
  await openNutrition(page);
  await expect(eaten(page).first()).toBeVisible({ timeout: 30_000 });
  await expect(todayCol(page).getByRole('img', { name: /^Calories eaten so far: 2,(?:[5-9]\d\d|4\d[1-9]|4[1-9]\d) \/ 2,400 kcal, [\d,]+ kcal over/ })).toBeVisible();
  await expect(meter(todayCol(page), 'Protein', '10\\d / 160')).toBeVisible();
  const sheet = await openAdd(page, 'One-off food');
  for (let guard = 0; guard < 25; guard++) {
    const n = await eaten(page).count();
    if (n >= 20) break;
    await addOneOff(sheet, 'Tea', 5, 0);
    await expect(eaten(page)).toHaveCount(n + 1); // the message text is the same every time, so wait on the count
  }
  await expect(eaten(page)).toHaveCount(20);
  await addOneOff(sheet, 'Tea', 5, 0); // the 21st
  await expect(sheet.getByRole('alert')).toContainText('You can log 20 things a day.');
  await expect(eaten(page)).toHaveCount(20);
  await sheet.getByRole('button', { name: 'Back to ways of adding' }).click();
  await sheet.getByRole('button', { name: /^Quick add/ }).click();
  const full = sheet.getByText(/That.s 20 things for the day\. Delete one to add another\./);
  await expect(full).toBeVisible();
  await closeSheet(page);
  await todayCol(page).getByRole('button', { name: 'Delete Tea' }).first().click();
  await expect(eaten(page)).toHaveCount(19);
  await openAdd(page, 'Quick add');
  await expect(full).toBeHidden();
  await closeSheet(page);
  await context.close();
});
