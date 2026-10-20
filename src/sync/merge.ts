import { normGroceryMonth } from '../shared/grocery.js';
import { normWeek } from '../shared/week.js';
import { normStretchWeek } from '../shared/stretchWeek.js';
import { mergeWeek } from '../lib/export.js';
import { stable } from './canon.js';
import type { GroceryLine, GroceryMonth, StretchWeek, Week } from '../types.ts';

/* ---------- Merge rules for a stale week save (ADR 031) ----------
   A week or stretch week refused as stale is merged three-way: base (the row this device's save was based on), ours (what it is
   sending) and theirs (the server's current row). For each key, a change made on one side only is kept; when both sides changed it
   to different values this device wins (ADR 003). A tick that is new on either side beats a skip. Without a base the week falls back
   to the two-way import merge (`mergeWeek`). A month of the grocery list is merged the same way, line by line (ADR 039). Every other
   row type is still "this device wins". */

export interface Merged<T> {
  week: T;
  /** The result has something this device's week did not, so the app must be shown it. */
  tookTheirs: boolean;
  /** A card (or stretch day) this device skipped is no longer skipped, because it was ticked on the other device. */
  unskipped: boolean;
}

const same = (a: unknown, b: unknown) => stable(a) === stable(b);
/** One value: theirs when this device left it as it was, else ours. */
const pick = <T>(base: T, ours: T, theirs: T): T => (same(ours, base) ? theirs : ours);

/** Each key of a map on its own; a missing key is a value too (so a removal on one side survives). */
function mergeMap<V>(base: Record<string, V>, ours: Record<string, V>, theirs: Record<string, V>): Record<string, V> {
  const out: Record<string, V> = {};
  for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(base)])) {
    const v = pick(base[k], ours[k], theirs[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Cards by id, in this device's order with the other side's new cards after. */
function mergeById<X extends { id: string }>(base: X[], ours: X[], theirs: X[]): X[] {
  const byId = (xs: X[]) => Object.fromEntries(xs.map(x => [x.id, x]));
  const kept = mergeMap(byId(base), byId(ours), byId(theirs));
  const order = [...ours, ...theirs].map(x => x.id).filter((id, i, all) => all.indexOf(id) === i);
  return order.filter(id => kept[id]).map(id => kept[id]!);
}


export function mergeWeek3(baseIn: unknown, oursIn: unknown, theirsIn: unknown): Merged<Week> {
  const ours = normWeek(oursIn); const theirs = normWeek(theirsIn);
  let week: Week;
  let unskipped = false;
  if (baseIn == null) {
    week = mergeWeek(ours, theirs);
    unskipped = Object.keys(ours.skipped).some(id => !week.skipped[id]);
  } else {
    const base = normWeek(baseIn);
    week = { ...ours,
      done: mergeMap(base.done, ours.done, theirs.done),
      skipped: mergeMap(base.skipped, ours.skipped, theirs.skipped),
      moved: mergeMap(base.moved, ours.moved, theirs.moved),
      ph: mergeMap(base.ph, ours.ph, theirs.ph),
      warm: {},
    };
    for (const d of new Set([...Object.keys(base.warm), ...Object.keys(ours.warm), ...Object.keys(theirs.warm)])) {
      const m = mergeMap(base.warm[d] || {}, ours.warm[d] || {}, theirs.warm[d] || {});
      if (Object.keys(m).length) week.warm[d] = m;
    }
    const extra = mergeById(base.extra || [], ours.extra || [], theirs.extra || []);
    if (extra.length) week.extra = extra; else delete week.extra;
    // The shown program, its record, and the rest days, day order and stash that go with it change together (switching programs
    // parks one program's layout and restores the other's), so they all come from one side.
    const layout = (x: Week) => ({ prog: x.prog, ran: x.ran, rest: x.rest, restOn: x.restOn, order: x.order, stash: x.stash });
    const l = pick(layout(base), layout(ours), layout(theirs));
    delete week.rest; delete week.restOn; delete week.order; delete week.stash; delete week.ran;
    week.prog = l.prog;
    if (l.rest) week.rest = l.rest;
    if (l.restOn) week.restOn = l.restOn;
    if (l.order) week.order = l.order;
    if (l.stash) week.stash = l.stash;
    if (l.ran) week.ran = l.ran;
    // A new tick beats a skip of the same card (a done key is the card id, or the id and "#n"), when the tick came from a side that
    // did not skip it: one device ticking half a superset and skipping the rest keeps its skip (clearForSkip).
    for (const k of Object.keys(week.done)) {
      const card = k.split('#')[0]!;
      if (!week.skipped[card] || base.done[k]) continue;
      if (!(ours.done[k] && !ours.skipped[card]) && !(theirs.done[k] && !theirs.skipped[card])) continue;
      delete week.skipped[card];
      if (ours.skipped[card]) unskipped = true;
    }
    // The same for one exercise skipped on its own (skipped["id#i"]): the other device's tick of it wins over this skip, and a tick from the
    // side that skipped it does not.
    for (const k of Object.keys(week.done)) {
      if (!k.includes('#') || !week.skipped[k] || base.done[k]) continue;
      if (!(ours.done[k] && !ours.skipped[k]) && !(theirs.done[k] && !theirs.skipped[k])) continue;
      delete week.skipped[k];
      if (ours.skipped[k]) unskipped = true;
    }
    week = normWeek(week);
  }
  return { week, tookTheirs: !same(week, ours), unskipped };
}

export function mergeStretchWeek3(baseIn: unknown, oursIn: unknown, theirsIn: unknown): Merged<StretchWeek> {
  const ours = normStretchWeek(oursIn); const theirs = normStretchWeek(theirsIn);
  // Without a base: the import's rules (union, this device's extra card wins).
  const base = baseIn == null ? null : normStretchWeek(baseIn);
  let week: StretchWeek = base
    ? { done: mergeMap(base.done, ours.done, theirs.done), skipped: mergeMap(base.skipped, ours.skipped, theirs.skipped), extra: mergeById(base.extra, ours.extra, theirs.extra) }
    : { done: { ...theirs.done, ...ours.done }, skipped: { ...theirs.skipped, ...ours.skipped }, extra: mergeById([], ours.extra, theirs.extra) };
  // A stretch newly ticked on the other device un-skips the day this device skipped (done keys are "<day>:<id>").
  let unskipped = false;
  for (const k of Object.keys(week.done)) {
    const day = k.split(':')[0]!;
    if (!week.skipped[day] || !ours.skipped[day] || ours.done[k] || !theirs.done[k] || (base && base.done[k])) continue;
    delete week.skipped[day];
    unskipped = true;
  }
  week = normStretchWeek(week);
  return { week, tookTheirs: !same(week, ours), unskipped };
}

/** A month of the grocery list (ADR 039): each item's line field by field (its tick, count and price), and the old pulled ids one by one,
 *  so two devices ticking different items, or one ticking and one fixing the price, keep both. Where both changed the same field this
 *  device wins. Without a base: every line of both, this device's fields over the other's. */
export function mergeGroceryMonth3(baseIn: unknown, oursIn: unknown, theirsIn: unknown): Merged<GroceryMonth> {
  const ours = normGroceryMonth(oursIn); const theirs = normGroceryMonth(theirsIn);
  const base = baseIn == null ? null : normGroceryMonth(baseIn);
  const flags = (ids: string[]) => Object.fromEntries(ids.map(id => [id, true as const]));
  const fields = (l: GroceryLine | undefined): Record<string, unknown> => ({ ...l });
  const lines: Record<string, GroceryLine> = {};
  for (const id of new Set([...Object.keys(ours.lines), ...Object.keys(theirs.lines), ...Object.keys(base?.lines ?? {})])) {
    const l: Record<string, unknown> = base ? mergeMap(fields(base.lines[id]), fields(ours.lines[id]), fields(theirs.lines[id])) : { ...theirs.lines[id], ...ours.lines[id] };
    // A pack's share belongs to the pack at the same place in `prices`, so the two travel together. When the devices ended with different
    // prices (a pack added or removed), take prices and shares both from the side that changed them (this device when both did); the other
    // side's share edits cannot be matched to packs that moved, so they are dropped rather than put on the wrong pack.
    const o = ours.lines[id], t = theirs.lines[id], b = base?.lines[id];
    if (JSON.stringify(o?.prices) !== JSON.stringify(t?.prices)) {
      const from = !base || JSON.stringify(o?.prices) !== JSON.stringify(b?.prices) ? o : t;
      delete l.prices; delete l.packShares;
      if (from?.prices) l.prices = from.prices;
      if (from?.packShares) l.packShares = from.packShares;
    }
    if (Object.keys(l).length) lines[id] = l as GroceryLine;
  }
  const pulled = base ? Object.keys(mergeMap(flags(base.pulled), flags(ours.pulled), flags(theirs.pulled))) : [...new Set([...ours.pulled, ...theirs.pulled])];
  // Who paid for each store, store by store like the lines.
  const payer = base ? mergeMap(base.payer ?? {}, ours.payer ?? {}, theirs.payer ?? {}) : { ...theirs.payer, ...ours.payer };
  const month = normGroceryMonth({ lines, pulled, payer });
  return { week: month, tookTheirs: !same(month, ours), unskipped: false };
}

/** The tables whose rows are merged three-way rather than replaced, and how. */
export type MergedTable = 'weeks' | 'stretch_weeks' | 'grocery_months';
export const merge3 = (table: MergedTable, base: unknown, ours: unknown, theirs: unknown): Merged<unknown> =>
  table === 'weeks' ? mergeWeek3(base, ours, theirs) : table === 'stretch_weeks' ? mergeStretchWeek3(base, ours, theirs) : mergeGroceryMonth3(base, ours, theirs);
