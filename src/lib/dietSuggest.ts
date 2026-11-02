import type { DietEntry } from '../types.ts';
import { MAX_DIET_PER_DAY } from '../shared/diet.js';
import { entriesOn, shiftDay } from './dietLog.js';
import type { Food } from './foodMacros.js';

/* ---------- Less typing for a day (brief diet-suggest-and-copy): foods you usually eat near this hour, and a day's entries to copy. Pure; the log view calls these. ---------- */

/** An entry counts toward "now" when it was added within this many hours (the clock wraps past midnight). */
export const HOUR_WINDOW = 2;
/** Suggestions read this many days back. */
export const LOOKBACK_DAYS = 60;

/** Hours apart on a 24-hour clock: 23 and 1 are 2 apart. */
export const hourGap = (a: number, b: number): number => { const d = Math.abs(a - b) % 24; return Math.min(d, 24 - d); };

const food = (e: DietEntry): Food => ({ n: e.n, kcal: e.kcal, p: e.p, ...(e.c !== undefined ? { c: e.c } : {}), ...(e.f !== undefined ? { f: e.f } : {}), ...(e.from ? { from: e.from } : {}) });

/** Foods to offer before anything is typed, best first: those you logged near `hour` often (an entry within HOUR_WINDOW counts 3, 2 or 1 by how close it is), then the rest by how recently you ate them. Each is as you last logged it (one per name, case-blind). Entries with no hour and entries older than LOOKBACK_DAYS before `today` count for recency only or not at all. */
export function suggestNow(entries: DietEntry[], hour: number, today: string, limit = 6): Food[] {
  const oldest = shiftDay(today, -LOOKBACK_DAYS);
  const rows = entries.map((e, i) => ({ e, i })).filter(r => r.e.d >= oldest && r.e.d <= today);
  rows.sort((a, b) => (a.e.d < b.e.d ? -1 : a.e.d > b.e.d ? 1 : a.i - b.i)); // oldest first; the list's own order breaks ties inside a day
  const by = new Map<string, { last: DietEntry; score: number; at: number }>();
  rows.forEach(({ e }, at) => {
    const k = e.n.trim().toLowerCase();
    const gap = e.t === undefined ? Infinity : hourGap(e.t, hour);
    const near = gap <= HOUR_WINDOW ? HOUR_WINDOW + 1 - gap : 0;
    const cur = by.get(k);
    by.set(k, { last: e, score: (cur?.score ?? 0) + near, at });
  });
  return [...by.values()].sort((a, b) => b.score - a.score || b.at - a.at).slice(0, limit).map(x => food(x.last));
}

/** What copying `ids` from day `from` to day `to` would do: the entries to add (as drafts, in the day's order, numbers and recipe link unchanged) and how many did not fit under the per-day limit. `ids` null means all of them. */
export function planCopy(entries: DietEntry[], from: string, to: string, ids: ReadonlySet<string> | null): { add: Food[]; left: number } {
  const picked = entriesOn(entries, from).filter(e => !ids || ids.has(e.id));
  const room = Math.max(0, MAX_DIET_PER_DAY - entriesOn(entries, to).length);
  return { add: picked.slice(0, room).map(food), left: Math.max(0, picked.length - room) };
}
