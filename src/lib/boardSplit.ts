import type { FlatSlot, ProgramSlot, SplitCard } from '../types.ts';
import { splitSuperset } from './programMove.js';
import type { WeekPatch, WeekState } from './programMove.ts';

// Moving one exercise of a superset card to another day for this week only (Board > the card's ⋯ > Move <exercise>). Pure helpers (ADR 070):
// which cards the week shows once the moves are applied, and the week's ticks, skips and phases under the new card ids.
// Nothing here changes the program, and the old keys stay in the week, so a copy of the app that does not know `week.split` reads the
// week as it was before the move.

// The cards of a week with its moves applied. A move names the card it came from (`from`, `k`); it applies only while that card still
// has the same exercise at that place (a program edited since leaves the card as it is), and moves made from a card that is itself the
// remainder of an earlier move wait for it, whatever order the list is in. The card keeps its place in the list; the moved exercise is added after.
export function applySplits(slots: FlatSlot[], splits: readonly SplitCard[] | undefined): FlatSlot[] {
  if (!splits || !splits.length) return slots;
  let out = slots; const left = [...splits];
  for (let progress = true; progress && left.length;) {
    progress = false;
    for (let n = 0; n < left.length; n++) {
      const sp = left[n]!; const at = out.findIndex(s => s.id === sp.from);
      const s = at < 0 ? null : out[at]!;
      if (!s || s.type !== 'superset' || s.items[sp.k]?.ex !== sp.item.ex) continue;
      const r = splitSuperset(s as unknown as ProgramSlot, sp.k, sp.id); if (!r) continue;
      const rest = { ...r.rest, id: sp.rest, type: r.rest.type ?? 'single' } as FlatSlot; // a superset left with one exercise is a plain card
      const moved = { ...r.moved, day: sp.day, type: 'single', items: [{ ...sp.item }] } as FlatSlot; // the stored item, so its sets and weight are kept
      out = [...out.slice(0, at), rest, ...out.slice(at + 1), moved];
      left.splice(n, 1); progress = true; break;
    }
  }
  return out;
}

// Putting a move back: the week's ticks and skips under the new ids go back onto the card `from` (`<id>#<position>`, or `<id>` when every
// exercise is ticked or skipped), so what was done after the move is kept; everything written under the new ids is deleted. Phase picks
// made after the move are not carried back (the old picks were never removed). `count` is the exercise count of `from` before the move.
export function joinMoveState(week: WeekState, e: SplitCard, count: number): WeekPatch {
  const patch: WeekPatch = { done: {}, skipped: {}, ph: {} };
  const rest = count - 1;
  (['done', 'skipped'] as const).forEach(f => {
    const m = (week[f] || {}) as Record<string, true>; const out = patch[f];
    const on = Array.from({ length: count }, (_, j) => (j === e.k ? !!m[e.id] : !!m[e.rest] || !!m[`${e.rest}#${j < e.k ? j : j - 1}`]));
    const all = on.every(Boolean);
    out[e.from] = all ? true : null;
    on.forEach((v, j) => { out[`${e.from}#${j}`] = v && !all ? true : null; });
    out[e.id] = null; out[e.rest] = null;
    for (let n = 0; n < rest; n++) out[`${e.rest}#${n}`] = null;
  });
  patch.ph[`${e.id}:0`] = null;
  for (let n = 0; n < rest; n++) patch.ph[`${e.rest}:${n}`] = null;
  return patch;
}
