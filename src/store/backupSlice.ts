import { buildDataFile, parseDataFile } from '../lib/export.js';
import { clearBackups, getBackup, listBackups, saveDailyBackup } from '../lib/autoBackup.js';
import { ymd } from '../shared/dates.js';
import type { BackupSlice, Flag, StoreGet, StoreSet } from './types.ts';

// The automatic backup (one copy a day, the last 7, in this browser). When it runs is in autoBackupRunner.ts.
export const backupSlice = (set: StoreSet, get: StoreGet, flag: Flag): BackupSlice => ({
  backups: null, // null until read
  async refreshBackups() { set({ backups: await listBackups() }); },
  async backupNow() {
    if (!get().isReady()) return; // never copy a half-loaded app
    try {
      const file = buildDataFile(await get().fullSnapshot(), await get().allWeeks());
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
  async forgetBackups() { await clearBackups(); set({ backups: [] }); },
});
