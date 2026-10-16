import { buildDataFile, parseDataFile } from '../lib/export.js';
import { clearBackups, getBackup, listBackups, pruneBackups, saveDailyBackup } from '../lib/autoBackup.js';
import { ymd } from '../shared/dates.js';
import type { BackupSlice, Flag, StoreGet, StoreSet } from './types.ts';

// The automatic backup (one copy a day for the last 7 days, in this browser). When it runs is in autoBackupRunner.ts.
// Once the copies are deleted (Sign out, Erase everything, Delete my account, a new-account wipe) nothing is written again until the page is
// reloaded, which each of those does next: a copy pending or running at that moment must not bring the old data back.
let stopped = false;
export const backupSlice = (set: StoreSet, get: StoreGet, flag: Flag): BackupSlice => ({
  backups: null, // null until read
  async refreshBackups() { await pruneBackups(ymd(new Date())); set({ backups: stopped ? [] : await listBackups() }); },
  async backupNow() {
    if (stopped || !get().isReady()) return; // never copy a half-loaded app
    try {
      const file = buildDataFile(await get().fullSnapshot(), await get().allWeeks());
      if (stopped) return; // deleted while the file was being built
      await saveDailyBackup(file, JSON.stringify(file), ymd(new Date()));
    } catch { /* a backup that fails is tried again at the next change */ }
    await get().refreshBackups();
  },
  // The copy goes through the normal import review, so nothing changes until the person chooses Merge or Replace there.
  async restoreBackup(date) {
    if (get().blocked()) return;
    const rec = await getBackup(date);
    if (!rec) { flag('That backup is gone'); await get().refreshBackups(); return; }
    try { set({ importDraft: { data: parseDataFile(rec.text), name: `Automatic backup of ${date}`, kind: 'json' }, importError: '', modal: { type: 'import' } }); }
    catch { flag('That backup could not be read'); }
  },
  async downloadBackup(date) {
    const rec = await getBackup(date); const dl = get().dl;
    if (!rec || !dl) { flag('Download isn’t available here'); return; }
    try { await dl.save({ filename: `iron-log-data-${date}-auto.json`, data: rec.text }); flag('Exported'); }
    catch (e) { if ((e as { code?: string } | null)?.code !== 'declined') flag('Download isn’t available here'); }
  },
  async forgetBackups() { stopped = true; await clearBackups(); set({ backups: [] }); },
});
