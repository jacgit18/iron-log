import { LS } from '../lib/storage.js';

/* ---------- What happened to the old data on this device (Phase E) ----------
   Remembered per browser, so the offer is made once and the answer is kept. The old documents themselves are never deleted:
   after an upload they stay as the copy the user can fall back on. */

const KEY = 'sync/legacy';

export type LegacyMarker =
  | { state: 'uploaded'; at: string; total: number }
  | { state: 'dismissed'; at: string };

export function readLegacyMarker(): LegacyMarker | null {
  const v = LS.get(KEY) as Partial<LegacyMarker> | null;
  if (v?.state === 'uploaded' && typeof v.at === 'string' && typeof v.total === 'number') return { state: 'uploaded', at: v.at, total: v.total };
  if (v?.state === 'dismissed' && typeof v.at === 'string') return { state: 'dismissed', at: v.at };
  return null;
}
export const writeLegacyMarker = (m: LegacyMarker) => LS.set(KEY, m);

/* The grocery list was kept on the device only until it synced (ADR 019, ADR 039). With syncing on, the list this browser held is added
   to the account once, automatically, when the one-time upload above cannot carry it (the account already has data, or that upload was
   made or turned down). This remembers that it was done, so a list later emptied on another device is not filled again from here. */
const GROCERY_KEY = 'sync/grocery-adopted';
export const groceryAdopted = () => !!LS.get(GROCERY_KEY);
export const markGroceryAdopted = (why: 'added' | 'nothing' | 'other-account') => LS.set(GROCERY_KEY, { at: new Date().toISOString(), why });

/** The paths of every document this browser holds under its own keys (see LS in lib/storage). */
export function localPaths(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('ironlog:')) out.push(k.slice('ironlog:'.length));
    }
  } catch { /* storage blocked: nothing to offer */ }
  return out;
}
