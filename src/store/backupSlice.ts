import { buildDataFile, dataStats, parseDataFile } from '../lib/export.js';
import { backupScore, clearBackups, getBackup, listBackups, pruneBackups, saveDailyBackup } from '../lib/autoBackup.js';
import { featureNow } from '../features.js';
import { fetchServerBackup, hasExpectedUser, listServerBackups, uploadBackup, uploadKey } from '../lib/serverBackups.js';
import { ymd } from '../shared/dates.js';
import type { BackupSlice, Flag, StoreGet, StoreSet } from './types.ts';

// The automatic backup (one copy a day for the last 7 days, in this browser). When it runs is in autoBackupRunner.ts.
// Once the copies are deleted (Sign out, Erase everything, Delete my account, a new-account wipe) nothing is written again until the page is
// reloaded, which each of those does next: a copy pending or running at that moment must not bring the old data back.
let stopped = false;
// The account copy (ADR 066): the last file the server answered for, so an unchanged file is not sent again; and a switch-off after the server says so.
let lastSent = ''; let serverOff = false;
export const backupSlice = (set: StoreSet, get: StoreGet, flag: Flag): BackupSlice => ({
  backups: null, // null until read
  async refreshBackups() { await pruneBackups(ymd(new Date())); set({ backups: stopped ? [] : await listBackups() }); },
  async backupNow() {
    if (stopped || !get().isReady()) return; // never copy a half-loaded app
    let uploadAfter: { file: ReturnType<typeof buildDataFile>; text: string; day: string } | null = null;
    try {
      const file = buildDataFile(await get().fullSnapshot(), await get().allWeeks());
      if (stopped) return; // deleted while the file was being built
      const text = JSON.stringify(file); const day = ymd(new Date());
      const saved = await saveDailyBackup(file, text, day);
      uploadAfter = saved === 'saved' ? { file, text, day } : null;
    } catch { /* a backup that fails is tried again at the next change */ }
    await get().refreshBackups(); // the list on this device first: it never waits on the network
    // Syncing on means there is an account; the server keeps this day beside the browser's copy. Only a file that was just saved goes up.
    if (uploadAfter && get().sync && featureNow('serverBackups') && hasExpectedUser() && !serverOff && !stopped && navigator.onLine !== false) {
      const { file, text, day } = uploadAfter; const score = backupScore(file);
      const key = uploadKey(day, score, text.length);
      if (key !== lastSent) {
        const r = await uploadBackup(day, text, dataStats(file).entries, score);
        if (r === 'saved' || r === 'kept' || r === 'refused') lastSent = key; // a refused file is not sent again until the data changes
        if (r === 'off' || r === 'signed-out' || r === 'account') serverOff = true; // no account to save to (a signed-out or other account, or switched off): quiet until the page reloads
        if (r === 'saved' && !stopped) void get().refreshServerBackups();
      }
    }
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
  async forgetBackups() { stopped = true; await clearBackups(); set({ backups: [], serverBackups: null }); },
  serverBackups: null,
  async refreshServerBackups() { if (get().sync && featureNow('serverBackups')) set({ serverBackups: stopped ? null : await listServerBackups() }); },
  async restoreServerBackup(date) {
    if (get().blocked()) return;
    const text = await fetchServerBackup(date);
    if (text == null) { flag('That backup could not be fetched'); await get().refreshServerBackups(); return; }
    try { set({ importDraft: { data: parseDataFile(text), name: `Account backup of ${date}`, kind: 'json' }, importError: '', modal: { type: 'import' } }); }
    catch { flag('That backup could not be read'); }
  },
});
