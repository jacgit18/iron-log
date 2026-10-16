import { test, expect } from './fixtures.js';

// The automatic backup (one copy a day, the last 7, in this browser): made a few seconds after the app opens, listed under Settings →
// Export & import, and restored through the import review. The fixture's clock is fixed at Sep 24 2026, so the timers are moved by hand.
const openBackups = async page => {
  await page.clock.fastForward(11_000); // past the first copy
  await page.click('#tab-settings');
  return page.getByRole('group', { name: 'Automatic backups' });
};

test('a copy of today is made after the app opens, and Restore opens it in the import review', async ({ page }) => {
  const box = await openBackups(page);
  await expect(box.locator('.exrow')).toHaveCount(1);
  await expect(box.locator('.exrow b')).toHaveText('Today, Sep 24');
  await box.getByRole('button', { name: 'Restore the backup from Sep 24' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('only the last 7 days are kept', async ({ page }) => {
  await openBackups(page);
  // Eight older days appear in the browser's backup store (as if the app had been used for a while), then the app opens again.
  await page.evaluate(async () => {
    const db = await new Promise((ok, no) => { const r = indexedDB.open('ironlog-backups', 1); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
    await new Promise((ok, no) => {
      const t = db.transaction('days', 'readwrite');
      for (let d = 10; d <= 17; d++) t.objectStore('days').put({ date: `2026-09-${d}`, savedAt: new Date().toISOString(), score: 5, entries: 0, text: '{}' });
      t.oncomplete = ok; t.onerror = () => no(t.error);
    });
    db.close();
  });
  await page.reload();
  const box = await openBackups(page);
  await expect(box.locator('.exrow')).toHaveCount(7);
  await expect(box.locator('.exrow b').first()).toHaveText('Today, Sep 24');
  await expect(box.locator('.exrow b').last()).toHaveText('Saturday, Sep 12');
});
