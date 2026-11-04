import type { FlatSlot } from '../types.ts';
import { isItemDone, isItemSkipped, isPaired, isSkipped, itemKey2 } from './logic.js';

// The Finished group on a Board day (brief finished-group-fold): the done and skipped cards of a day, folded into one bar that opens into
// one compact row per exercise. Pure helpers (ADR 070); the component only draws and calls the store.

type Week = Parameters<typeof isSkipped>[1];

export interface FinishedRow {
  key: string;
  slotId: string;
  idx: number; // the exercise inside the card (the Edit button opens the log sheet for it)
  kind: 'done' | 'skipped';
  /** The row acts on the whole card (checkCard, skipCard) rather than on one exercise of a paired card (checkItem, skipItem). */
  whole: boolean;
  /** Exercise ids the row names: one for a single exercise, all of a card skipped as a whole. */
  exs: string[];
  /** How the names join when there are several. */
  join: ' → ' | ' or ';
}

const joinOf = (s: FlatSlot): ' → ' | ' or ' => (s.type === 'either' ? ' or ' : ' → ');

/**
 * The rows of a day's finished cards, in the order given. A single card is one row. A card skipped as a whole is one row naming all its
 * exercises. A paired card (superset, either/or) gets one row per exercise that is done or skipped on its own, so each can be undone alone.
 */
export function finishedRows(cards: readonly FlatSlot[], week: Week): FinishedRow[] {
  const rows: FinishedRow[] = [];
  for (const s of cards) {
    const exs = s.items.map(i => i.ex);
    const skipped = isSkipped(s, week);
    if (skipped && (!isPaired(s) || !!week.skipped?.[s.id])) { // not skipped one exercise at a time
      rows.push({ key: s.id, slotId: s.id, idx: 0, kind: 'skipped', whole: true, exs, join: joinOf(s) });
      continue;
    }
    if (!isPaired(s)) { rows.push({ key: s.id, slotId: s.id, idx: 0, kind: 'done', whole: true, exs: [exs[0]!], join: ' → ' }); continue; }
    s.items.forEach((_, idx) => {
      const kind = isItemSkipped(s, idx, week) ? 'skipped' : isItemDone(s, idx, week) ? 'done' : null;
      if (kind) rows.push({ key: itemKey2(s, idx), slotId: s.id, idx, kind, whole: false, exs: [exs[idx]!], join: ' → ' });
    });
  }
  return rows;
}

/** The bar's two count pills, from the day's tally of its finished cards: "2 done", "1 skipped", none when zero. */
export const finishedPills = (t: { done: number; skipped: number }): { kind: 'done' | 'skipped'; text: string }[] => [
  ...(t.done ? [{ kind: 'done' as const, text: `${t.done} done` }] : []),
  ...(t.skipped ? [{ kind: 'skipped' as const, text: `${t.skipped} skipped` }] : []),
];
