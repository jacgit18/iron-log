import type { SupplementItem, SupplementSlot } from '../types.ts';
import { SLOTS, sameSupplement } from './supplements.js';
import { plainText } from './picker.js';
import { timesOf, toggleTime, type TimeChoice } from './supplementTimes.js';

// The merged supplement list in Manage (brief supplement-merged-list): one row per supplement, however many times a day it is taken. The store keeps one entry
// per time (brief supplement-split-times); this folds those entries into rows, filters them, and turns a time chip tap into the store call that makes it so.

export type ListFilter = 'all' | 'scheduled' | 'library';
export type ListSource = '' | 'custom' | 'library';

export interface ListRow {
  /** The entry listed first: the one at the row's first time, or the library-only entry. Edit, reorder and `suplib-<id>` use it. */
  id: string;
  n: string; brand?: string; dose?: string; note?: string; catalogId?: string;
  /** The times it is taken, Morning to Night. Empty: Library only. */
  slots: SupplementSlot[];
  /** The time the row is listed under and reordered within ('' for Library only). */
  primary: SupplementSlot;
}

const slotRank = (s: SupplementSlot) => { const i = SLOTS.findIndex(([k]) => k === s); return i < 0 ? SLOTS.length : i; };

/** One row per name and brand, listed by first time of day (then Library only), the store order kept inside each group. */
export function groupSupplements(items: readonly SupplementItem[]): ListRow[] {
  const rows: (ListRow & { first: number })[] = []; const doses = new Map<ListRow, string[]>();
  items.forEach((it, idx) => {
    let r = rows.find(x => sameSupplement(x, it.n, it.brand));
    if (!r) { r = { id: it.id, n: it.n, brand: it.brand, dose: it.dose, note: it.note, catalogId: it.catalogId, slots: [], primary: '', first: idx }; rows.push(r); }
    if (it.dose && !doses.get(r)?.includes(it.dose)) doses.set(r, [...(doses.get(r) || []), it.dose]);
    if (!r.note && it.note) r.note = it.note;
    if (it.slot && !r.slots.includes(it.slot)) r.slots.push(it.slot);
  });
  for (const r of rows) {
    const d = doses.get(r); if (d) r.dose = d.join(' / '); // entries can differ (1 g in the morning, 2 g at night)
    r.slots.sort((a, b) => slotRank(a) - slotRank(b));
    r.primary = r.slots[0] ?? '';
    // The entry at the first time (or the library-only one), so reordering moves what the Board shows.
    r.id = items.find(i => i.slot === r.primary && sameSupplement(i, r.n, r.brand))!.id;
  }
  return rows.map(({ first: _f, ...r }) => r).sort((a, b) => slotRank(a.primary) - slotRank(b.primary)); // Array sort is stable
}

export const rowCounts = (rows: readonly ListRow[]) => {
  const scheduled = rows.filter(r => r.slots.length).length;
  return { all: rows.length, scheduled, library: rows.length - scheduled };
};

/** The search words match name and brand; the filter and Source narrow further (Source only means something when syncing). */
export function filterRows(rows: readonly ListRow[], o: { q: string; filter: ListFilter; source: ListSource }): ListRow[] {
  const words = plainText(o.q).split(' ').filter(Boolean);
  return rows.filter(r => (!words.length || words.every(w => plainText(`${r.n} ${r.brand || ''}`).includes(w)))
    && (o.filter === 'all' || (o.filter === 'scheduled' ? r.slots.length > 0 : r.slots.length === 0))
    && (!o.source || (r.catalogId ? 'library' : 'custom') === o.source));
}

/** True when both catalog and typed-in supplements exist, which is when the Source filter is worth showing. */
export const hasBothSources = (rows: readonly ListRow[]) => rows.some(r => r.catalogId) && rows.some(r => !r.catalogId);

/** "Brand · dose · note", or the words for an empty row. */
export const rowSub = (r: ListRow) => [r.brand, r.dose, r.note].filter(Boolean).join(' · ') || 'No dose or note';

/** "2 a day", or "Library only". */
export const perDay = (r: ListRow) => (r.slots.length ? `${r.slots.length} a day` : 'Library only');

export type ChipAction = { kind: 'save'; times: TimeChoice[] } | { kind: 'remove'; id: string } | null;

/**
 * A tap on a time chip. A time turned on is saved with the existing times (a library-only entry moves in, otherwise a copy is added at one serving).
 * A time turned off is saved the same way, except the last one: `saveSupplementTimes` keeps a scheduled supplement on a time, so the last chip off
 * removes that entry instead, which leaves the supplement in the library (`removeSupplement`). The save passes no dose, so each time keeps its own.
 */
export function chipTap(items: readonly SupplementItem[], id: string, slot: SupplementSlot): ChipAction {
  const cur = items.find(i => i.id === id); if (!cur) return null;
  const times = timesOf(items, id);
  if (times.length === 1 && times[0].slot === slot) {
    const entry = items.find(i => i.slot === slot && sameSupplement(i, cur.n, cur.brand));
    return entry ? { kind: 'remove', id: entry.id } : null;
  }
  const next = toggleTime(times, slot);
  return next === times ? null : { kind: 'save', times: next };
}
