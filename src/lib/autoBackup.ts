/* ---------- Automatic backup: one copy of your data a day, for the last 7 days, kept in this browser ----------
   Each copy is the same file Export all data makes, so Restore feeds it to the normal import review. Kept in IndexedDB (a data file can
   be too big for localStorage). Nothing here throws: a browser that blocks IndexedDB (a private window) simply has no backups. */
import { dataStats } from './export.js';
import { addDays, parseDate, ymd } from '../shared/dates.js';
import type { DataFile } from '../types.ts';

export const BACKUP_DAYS = 7;
const SHRINK_FLOOR = 10; // a copy this small is not worth guarding
const SHRINK_RATIO = 0.5;
const DB_NAME = 'ironlog-backups'; const STORE = 'days';

export interface BackupInfo { date: string; savedAt: string; score: number; entries: number; device?: string }
interface BackupRecord extends BackupInfo { text: string }

/** How much a data file holds, as one number: sessions, body weights, weeks, saved programs, experiments, stretches, water days, groceries, edited programs. */
export function backupScore(d: Partial<DataFile>): number {
  const s = dataStats(d);
  return s.entries + s.body + s.weeks + s.saved + s.experiments + s.stretches + s.waterDays + s.groceryItems + s.programs.length;
}
/** Today's copy is only replaced by one that holds at least half as much, so a wipe or a failed load cannot overwrite a good copy the same day. */
export const shouldWrite = (before: number | null, after: number) => before == null || before < SHRINK_FLOOR || after >= before * SHRINK_RATIO;
/** The dates older than the last `days` calendar days, today included. */
export const expiredDates = (dates: string[], today: string, days = BACKUP_DAYS) => { const cutoff = ymd(addDays(parseDate(today), -(days - 1))); return dates.filter(d => d < cutoff); };

const open = (): Promise<IDBDatabase | null> => new Promise(resolve => {
  if (typeof indexedDB === 'undefined') { resolve(null); return; }
  try {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'date' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  } catch { resolve(null); }
});
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, fallback: T): Promise<T> {
  const db = await open(); if (!db) return fallback;
  return new Promise<T>(resolve => {
    try {
      const t = db.transaction(STORE, mode); const r = fn(t.objectStore(STORE));
      t.oncomplete = () => { db.close(); resolve(r.result); };
      t.onerror = t.onabort = () => { db.close(); resolve(fallback); };
    } catch { db.close(); resolve(fallback); }
  });
}
const info = ({ date, savedAt, score, entries }: BackupRecord): BackupInfo => ({ date, savedAt, score, entries });

export async function listBackups(): Promise<BackupInfo[]> {
  const all = await tx<BackupRecord[]>('readonly', s => s.getAll() as IDBRequest<BackupRecord[]>, []);
  return all.map(info).sort((a, b) => b.date.localeCompare(a.date));
}
export const getBackup = (date: string) => tx<BackupRecord | undefined>('readonly', s => s.get(date) as IDBRequest<BackupRecord | undefined>, undefined);
export async function clearBackups(): Promise<void> { await tx('readwrite', s => s.clear(), undefined); }

/** Saves today's copy (replacing today's earlier one) and drops anything older than the last 7 days. 'kept': today's earlier, fuller copy was left alone. */
export async function saveDailyBackup(file: Partial<DataFile>, text: string, date: string): Promise<'saved' | 'kept' | 'unavailable'> {
  const score = backupScore(file);
  const today = await getBackup(date);
  if (today && !shouldWrite(today.score, score)) return 'kept';
  const rec: BackupRecord = { date, savedAt: new Date().toISOString(), score, entries: dataStats(file).entries, text };
  const db = await open(); if (!db) return 'unavailable';
  const stored = await new Promise<boolean>(resolve => {
    try {
      const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(rec);
      t.oncomplete = () => resolve(true); t.onerror = t.onabort = () => resolve(false);
    } catch { resolve(false); }
  });
  db.close();
  if (!stored) return 'unavailable';
  await pruneBackups(date);
  return 'saved';
}
/** Deletes the copies older than 7 calendar days. */
export async function pruneBackups(today: string): Promise<void> {
  for (const d of expiredDates((await listBackups()).map(b => b.date), today)) await tx('readwrite', s => s.delete(d), undefined);
}
