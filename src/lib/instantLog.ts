import { MAX_DIET_PER_DAY } from '../shared/diet.js';
import type { DietEntry } from '../types.ts';

/** What the store's `addDietEntry` takes and answers: an error text (full day, bad numbers), else the new id. */
export type NewEntry = Omit<DietEntry, 'id'>;
export type AddEntry = (e: NewEntry) => { id: string | null; error: string | null };

export type InstantLog = {
  /** Entries that were added before the first refusal. */
  done: number;
  /** The ids of those entries, in order (Undo needs them). */
  ids: string[];
  /** The store's own words for the entry it refused, else null. */
  error: string | null;
  /** The status sentence all instant logs share: "Added 3 from Oats. <store error | 2 left out: 20 a day is the limit.>" */
  text: string;
};

/** The one sentence after an instant log. The store's own words win when an add fails (a full day, a day too far back, bad numbers); the day limit note is only for what the plan left out. */
export function instantLogText(done: number, opts: { from?: string; error?: string | null; left?: number; verb?: string } = {}): string {
  const tail = opts.error ? ` ${opts.error}` : (opts.left ?? 0) > 0 ? ` ${opts.left} left out: ${MAX_DIET_PER_DAY} a day is the limit.` : '';
  return `${opts.verb ?? 'Added'} ${done}${opts.from ? ` from ${opts.from}` : ''}.${tail}`;
}

/** The loop every instant log runs (Copy yesterday, a saved meal, the Goes with chip): add the entries one by one, stop at the first one the store refuses. `left` is how many the caller's plan already dropped for the day limit. */
export function runInstantLog(add: AddEntry, entries: readonly NewEntry[], opts: { from?: string; left?: number; verb?: string } = {}): InstantLog {
  const ids: string[] = [];
  let error: string | null = null;
  for (const e of entries) {
    const r = add(e);
    if (r.error || !r.id) { error = r.error ?? 'Couldn’t log that.'; break; }
    ids.push(r.id);
  }
  return { done: ids.length, ids, error, text: instantLogText(ids.length, { ...opts, error }) };
}
