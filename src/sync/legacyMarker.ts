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
