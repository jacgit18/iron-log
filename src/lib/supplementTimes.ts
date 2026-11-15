import type { SupplementItem, SupplementServing, SupplementSlot } from '../types.ts';
import { SLOTS, sameSupplement, slotLabel } from './supplements.js';
import { fmtServings, formWord, normPortion, portionOf, stepPortion, unitsOf } from './supplementPortion.js';

/* ---------- Times of day for one supplement (brief supplement-split-times) ----------
   A supplement taken at two times is already two entries (instances), each with its own section, amount and ticks. This is the sheet's view of
   them as one list: which times are on and how much at each. Pure: the sheet reads and edits a TimeChoice[], and `planTimes` says what Save does. */

/** The most servings one time can hold (the stepper stops here). */
export const MAX_TIME_PORTION = 6;

export interface TimeChoice { slot: SupplementSlot; portion: number }

const order = (a: TimeChoice[]): TimeChoice[] => SLOTS.flatMap(([k]) => a.filter(t => t.slot === k));

/** The times a supplement is on now: every scheduled entry of the same product (name, brand), in Morning, Noon, Night order. */
export function timesOf(items: readonly SupplementItem[], id: string): TimeChoice[] {
  const cur = items.find(i => i.id === id);
  if (!cur) return [];
  return order(items.filter(i => i.slot && sameSupplement(i, cur.n, cur.brand)).map(i => ({ slot: i.slot, portion: portionOf(i) })));
}

/** A chip tap: a time that is off turns on at one serving; one that is on turns off, except the last one (a scheduled supplement keeps a time). */
export function toggleTime(times: TimeChoice[], slot: SupplementSlot): TimeChoice[] {
  if (!SLOTS.some(([k]) => k === slot)) return times;
  if (times.some(t => t.slot === slot)) return times.length < 2 ? times : times.filter(t => t.slot !== slot);
  return order([...times, { slot, portion: 1 }]);
}

/** One tap on a time's stepper; `units` is the capsules in a serving, if known. Never below one step or above MAX_TIME_PORTION servings. */
export function stepTime(times: TimeChoice[], slot: SupplementSlot, dir: 1 | -1, units: number | undefined): TimeChoice[] {
  return times.map(t => (t.slot === slot ? { slot, portion: Math.min(MAX_TIME_PORTION, stepPortion(t.portion, dir, units)) } : t));
}

/** An amount as a count of the serving's unit when known ("2" capsules), else of servings. */
const countOf = (portion: number, serving: SupplementServing | undefined | null): string => { const u = unitsOf(serving); return fmtServings(u ? Math.round(portion * u * 100) / 100 : portion); };

/** "2 softgels a day" and "Morning 1 · Night 1". Empty main when no time is on. */
export function dayTotal(times: TimeChoice[], serving: SupplementServing | undefined | null): { main: string; detail: string } {
  if (!times.length) return { main: '', detail: '' };
  const sum = times.reduce((a, t) => a + t.portion, 0);
  const u = unitsOf(serving);
  const n = u ? Math.round(sum * u * 100) / 100 : sum;
  const word = u ? formWord(serving) : 'serving';
  return { main: `${fmtServings(n)} ${n === 1 ? word : `${word}s`} a day`, detail: times.map(t => `${slotLabel(t.slot)} ${countOf(t.portion, serving)}`).join(' · ') };
}

export interface TimesPlan {
  /** Entries to move into a time (a library-only entry of the product), with the amount there. */
  move: { id: string; slot: SupplementSlot; portion: number }[];
  /** New entries copied from `from` (its name, brand, note, rows), with their own time and amount. */
  add: { from: string; slot: SupplementSlot; portion: number }[];
  /** Existing entries whose amount changes. */
  set: { id: string; portion: number }[];
  /** Entries whose time was turned off. */
  remove: string[];
}

/** What Save does for the product of entry `id` so its times become `times`. Null when `times` is empty or the entry is unknown. */
export function planTimes(items: readonly SupplementItem[], id: string, times: TimeChoice[]): TimesPlan | null {
  const cur = items.find(i => i.id === id);
  if (!cur || !times.length) return null;
  const group = items.filter(i => sameSupplement(i, cur.n, cur.brand));
  const plan: TimesPlan = { move: [], add: [], set: [], remove: [] };
  let parked = group.find(i => !i.slot); // a library-only copy moves in instead of making a new entry
  for (const t of order(times)) {
    const have = group.find(i => i.slot === t.slot);
    if (have) { if (portionOf(have) !== (normPortion(t.portion) ?? 1)) plan.set.push({ id: have.id, portion: t.portion }); continue; }
    if (parked) { plan.move.push({ id: parked.id, slot: t.slot, portion: t.portion }); parked = undefined; } else plan.add.push({ from: cur.id, slot: t.slot, portion: t.portion });
  }
  plan.remove = group.filter(i => i.slot && !times.some(t => t.slot === i.slot)).map(i => i.id);
  return plan;
}

/** The times chosen in the Add sheet: one chip toggles its time, "Library only" ('') clears the others and is cleared by any time. */
export function toggleAddSlot(sel: SupplementSlot[], slot: SupplementSlot): SupplementSlot[] {
  if (slot === '') return sel.includes('') ? [] : [''];
  const times = SLOTS.map(([k]) => k).filter(k => (sel.includes(k) ? k !== slot : k === slot));
  return times;
}
