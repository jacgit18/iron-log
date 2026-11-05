import type { GroceryItem, GroceryLine, GroceryShare } from '../types.ts';
import { partiesOf } from './grocerySplit.js';
import { shareText } from './grocerySettle.js';

/* ---------- Bulk share (brief grocery-bulk-share): set who shares many To get items at once. Pure; the sheet holds the choices and `applyBulkShare` /
   `restoreShareSnapshot` run them through the store actions that already exist (so a share is cleaned and pinned exactly as the per-row chip does it). ---------- */

/** The sheet's choices: the people ticked, "It's not for me", and "Use the usual split" (which clears the choice). */
export interface ShareForm { people: string[]; notMine: boolean; reset: boolean }
export const emptyForm = (): ShareForm => ({ people: [], notMine: false, reset: false });

/** Ticking a person ends "use the usual"; unticking the last person ends "not for me" (it only means something with someone to give it to). */
export function togglePerson(f: ShareForm, id: string, on: boolean): ShareForm {
  const people = on ? [...f.people.filter(p => p !== id), id] : f.people.filter(p => p !== id);
  return { people, notMine: people.length ? f.notMine : false, reset: false };
}
export const setNotMine = (f: ShareForm, on: boolean): ShareForm => ({ ...f, notMine: on && f.people.length > 0, reset: false });
/** "Use the usual split" clears the other choices; leaving it is ticking anything else. */
export const setReset = (f: ShareForm, on: boolean): ShareForm => (on ? { people: [], notMine: false, reset: true } : { ...f, reset: false });

/** The share the choices make: null clears the line's own share; nobody ticked is an explicit "Just me". */
export function shareFromForm(f: ShareForm): GroceryShare | null {
  if (f.reset) return null;
  return f.people.length && f.notMine ? { with: [...f.people], notMine: true } : { with: [...f.people] };
}

/** A line with its share set (null clears it). A pack's own share beats the line's, so the packs' shares are dropped: the split on every pack is what was chosen.
 *  Returns null when nothing is left of the line. */
export function lineWithShare(line: GroceryLine | undefined, share: GroceryShare | null): GroceryLine | null {
  const l: GroceryLine = { ...(line ?? {}) };
  if (share) l.share = share; else delete l.share;
  delete l.packShares;
  return Object.keys(l).length ? l : null;
}

/** How many of the picked lines are priced pack by pack at all. */
export const packPriced = (ids: readonly string[], lines: Record<string, GroceryLine>): number => ids.filter(id => lines[id]?.prices?.length).length;

/** The sheet's one-line note about packs, or '' when none of the picked items has any. */
export function packNote(ids: readonly string[], lines: Record<string, GroceryLine>): string {
  const n = packPriced(ids, lines);
  if (!n) return '';
  return `${n === 1 ? '1 picked item is' : `${n} picked items are`} priced pack by pack: every pack gets this split.`;
}

/** "Shared 4 items: Me +1." / "Shared 1 item: the usual split." */
export function sharedText(count: number, share: GroceryShare | null): string {
  const what = share ? shareText(partiesOf(share, undefined, new Set(share.with))) : 'the usual split';
  return `Shared ${count} ${count === 1 ? 'item' : 'items'}: ${what}.`;
}

/** The store actions Apply and Undo run. */
export interface ShareApi {
  /** True while sync is still loading: every write is refused then, and the store says so itself. */
  blocked(): boolean;
  setGroceryLineShare(month: string, id: string, share: GroceryShare | null): void;
  setGroceryItemShare(id: string, share: GroceryShare | null): void;
  restoreGroceryLine(month: string, id: string, line: GroceryLine | null): void;
}

/** What Apply is about to change, so Undo can put it back: each picked line as it is now (null: none) and each item's usual split. */
export interface ShareSnapshot { month: string; lines: Record<string, GroceryLine | null>; usual: Record<string, GroceryShare | null> }

export function takeShareSnapshot(month: string, ids: readonly string[], lines: Record<string, GroceryLine>, items: readonly GroceryItem[]): ShareSnapshot {
  const snap: ShareSnapshot = { month, lines: {}, usual: {} };
  for (const id of ids) {
    const it = items.find(i => i.id === id);
    if (!it) continue; // a removed item has nothing to share
    snap.lines[id] = lines[id] ? structuredClone(lines[id]!) : null;
    snap.usual[id] = it.share ? structuredClone(it.share) : null;
  }
  return snap;
}

const same = (a: GroceryShare | null | undefined, b: GroceryShare | null | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Runs the choice over the snapshot's items. By default only the month's line is written (straight to the line, so the item's usual split and the earlier months stay untouched);
 *  with `usual` the existing `setGroceryLineShare` also makes it the item's usual split. Packs' own shares are dropped so every pack takes the line's split. The snapshot keeps
 *  a usual split only for the items whose usual was written, so Undo touches nothing else. Returns how many items were written. */
export function applyBulkShare(api: ShareApi, items: () => readonly GroceryItem[], snap: ShareSnapshot, share: GroceryShare | null, usual: boolean): number {
  let done = 0;
  for (const id of Object.keys(snap.lines)) {
    const line = snap.lines[id] ?? undefined;
    if (usual && share) {
      api.setGroceryLineShare(snap.month, id, share);
      if (line?.packShares) api.restoreGroceryLine(snap.month, id, lineWithShare(line, share)); // the packs go after the line was written
      if (!same(items().find(i => i.id === id)?.share, share)) api.setGroceryItemShare(id, share); // an earlier month: the action above leaves the usual alone
    } else {
      api.restoreGroceryLine(snap.month, id, lineWithShare(line, share));
      delete snap.usual[id];
    }
    done++;
  }
  return done;
}
/** Puts every touched usual split and line share back; false (and nothing written) while sync is loading. Only the share and pack shares of a line are put back, on the line as it is now,
 *  so a tick or price changed since Apply stays. The usual goes first: changing a usual split pins earlier bought lines to the split they were counted with. */
export function restoreShareSnapshot(snap: ShareSnapshot, api: ShareApi, lineNow: (month: string, id: string) => GroceryLine | undefined): boolean {
  if (api.blocked()) return false; // nothing is written; the caller keeps the notice so Undo can be pressed again
  for (const [id, share] of Object.entries(snap.usual)) api.setGroceryItemShare(id, share);
  for (const [id, saved] of Object.entries(snap.lines)) {
    const l: GroceryLine = { ...(lineNow(snap.month, id) ?? {}) };
    delete l.share; delete l.packShares;
    if (saved?.share) l.share = saved.share;
    if (saved?.packShares) l.packShares = saved.packShares;
    api.restoreGroceryLine(snap.month, id, Object.keys(l).length ? l : null);
  }
  return true;
}
