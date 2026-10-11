import { normWeek } from '../shared/week.js';
import { normStretchWeek } from '../shared/stretchWeek.js';
import { mergeWeek } from '../lib/export.js';
import { stable } from './canon.js';
import type { StretchWeek, Week } from '../types.ts';

/* ---------- Merge rules for a stale week save (ADR 031) ----------
   A week or stretch week refused as stale is merged three-way: base (the row this device's save was based on), ours (what it is
   sending) and theirs (the server's current row). For each key, a change made on one side only is kept; when both sides changed it
   to different values this device wins (ADR 003). A tick that is new on either side beats a skip. Without a base the week falls back
   to the two-way import merge (`mergeWeek`). Every other row type is still "this device wins". */

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

const added = (key: string, base: Record<string, unknown>, ours: Record<string, unknown>, theirs: Record<string, unknown>) =>
  !base[key] && !!(ours[key] || theirs[key]);

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
    const order = pick(base.order, ours.order, theirs.order);
    if (order) week.order = order; else delete week.order;
    // Values that only make sense together come from the same side.
    const rest = pick({ rest: base.rest, restOn: base.restOn }, { rest: ours.rest, restOn: ours.restOn }, { rest: theirs.rest, restOn: theirs.restOn });
    delete week.rest; delete week.restOn;
    if (rest.rest) week.rest = rest.rest;
    if (rest.restOn) week.restOn = rest.restOn;
    const ran = pick({ prog: base.prog, ran: base.ran }, { prog: ours.prog, ran: ours.ran }, { prog: theirs.prog, ran: theirs.ran });
    week.prog = ran.prog; delete week.ran;
    if (ran.ran) week.ran = ran.ran;
    // A new tick beats a skip of the same card (a done key is the card id, or the id and "#n").
    for (const k of Object.keys(week.done)) {
      const card = k.split('#')[0]!;
      if (!week.skipped[card] || !added(k, base.done, ours.done, theirs.done)) continue;
      delete week.skipped[card];
      if (ours.skipped[card]) unskipped = true;
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
