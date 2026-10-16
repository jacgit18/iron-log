import type { Logs, Week } from '../types.ts';
import { itemKey, itemKey2 } from './logic.js';

/* ---------- The part of the week and the logs one board card reads ----------
   A board card is drawn from the whole week and all logs, but it only reads its own keys: done, skipped, moved and the week's
   phase picks for its exercises, the rest days and day order (where columns are), and the log entries of its own exercises.
   A card subscribes to these slices instead of the whole week, so ticking one card redraws that card, not all of them.
   Every helper Card calls must give the same answer for a slice as for the whole week (cardView.test.ts checks this);
   a new read of `week` or `logs` in Card needs its key added here. */

type CardLike = { id: string; items: { ex: string }[] };

export type CardWeek = Pick<Week, 'done' | 'skipped' | 'moved' | 'ph' | 'rest' | 'order'>;

const pick = <T,>(from: Record<string, T> | undefined, keys: string[]): Record<string, T> => {
  const out: Record<string, T> = {};
  if (from) for (const k of keys) if (k in from) out[k] = from[k];
  return out;
};

export function cardWeek(week: Week, s: CardLike): CardWeek {
  const idx = s.items.map((_, i) => i);
  return {
    done: pick(week.done, [s.id, ...idx.map(i => itemKey2(s, i))]),
    skipped: pick(week.skipped, [s.id, ...idx.map(i => itemKey2(s, i))]),
    moved: pick(week.moved, [s.id]),
    ph: pick(week.ph, idx.map(i => itemKey(s, i))),
    rest: week.rest,
    order: week.order,
  };
}

export const cardLogs = (logs: Logs, s: CardLike): Logs => pick(logs, s.items.map(it => it.ex));
