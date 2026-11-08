import { expect, test } from '@playwright/test';
import { signInAs } from './persona.js';

// QA scenario S-108 (Superset builder): the Board section for exercises seen online is called Ideas to try, adding one works, a duplicate is refused,
// and "This week only" puts a card tagged To try on that day.
test('S-108: Ideas to try on the Board, add an idea, refuse a duplicate, and put it on a day', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'superset-builder');
  const section = page.getByRole('region', { name: 'Ideas to try' });
  await expect(section.getByRole('heading', { name: 'Ideas to try' })).toBeVisible({ timeout: 30_000 });
  await expect(section.getByRole('button', { name: '+ Add idea' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Experiments');
  const addIdea = async () => {
    await section.getByRole('button', { name: '+ Add idea' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'Add an exercise to try' })).toBeVisible();
    await sheet.locator('#exp-ex').fill('Face Pull');
    const option = sheet.getByRole('option', { name: /^Face Pull/ }).first();
    if (await option.isVisible().catch(() => false)) await option.click();
    await sheet.getByLabel('Note').fill('saw it on YouTube');
    await sheet.getByRole('button', { name: 'Save' }).click();
    return sheet;
  };
  await addIdea();
  await expect(section.getByText('Face Pull').first()).toBeVisible();
  await expect(section).toContainText('saw it on YouTube');
  await section.getByRole('button', { name: /Edit Face Pull/ }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Edit idea' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  const sheet = await addIdea();
  await expect(sheet.getByText('Face Pull is already on the Ideas to try list.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await section.getByRole('button', { name: 'This week only' }).click();
  await expect(page.getByText(/Added Face Pull to/)).toBeVisible();
  await expect(page.locator('.board').getByText('To try').first()).toBeVisible();
  await context.close();
});
