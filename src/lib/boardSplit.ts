import type { FlatSlot, PhaseKey, SplitCard } from '../types.ts';
import type { WeekPatch, WeekState } from './programMove.ts';

// Moving one exercise of a superset card to another day for this week only (Board > the card's ⋯ > Move <exercise>). Pure helpers (ADR 070):
// which cards the week shows once the moves are applied, and the week's ticks, skips and phases under the new card ids.
// Nothing here changes the program, and the old keys stay in the week, so a copy of the app that does not know `week.split` reads the
// week as it was before the move.

const plainSec = (sec?: string) => (sec === 'Supersets' ? 'Regular' : sec);

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
      if (!s || s.type !== 'superset' || s.items.length < 2 || s.items[sp.k]?.ex !== sp.item.ex) continue;
      const items = s.items.filter((_, i) => i !== sp.k).map(it => ({ ...it }));
      const rest: FlatSlot = { ...s, id: sp.rest, items };
      if (items.length === 1) { rest.type = 'single'; if (rest.sec) rest.sec = plainSec(rest.sec); }
      const moved: FlatSlot = { id: sp.id, day: sp.day, type: 'single', items: [{ ...sp.item }] };
      if (s.sec) moved.sec = plainSec(s.sec);
      if (s.tier) moved.tier = s.tier;
      if (s.from) moved.from = s.from;
      out = [...out.slice(0, at), rest, ...out.slice(at + 1), moved];
      left.splice(n, 1); progress = true; break;
    }
  }
  return out;
}

export interface SplitState { patch: WeekPatch; undo: WeekPatch; keys: string[] }

// The week's per-exercise state under the new ids (`done` and `skipped`: `<id>#<position>`, or `<id>` for a plain card or a whole superset;
// `ph`: `<id>:<position>`). `phase(j)` is the phase shown for exercise j now (this week's pick, else the saved default): the new cards have
// no saved default, so it is written as this week's pick. The ticked, skipped and phase of the exercise go with it; the others keep theirs
// in the order they have left. `undo` deletes everything written. The keys under the old id are left alone.
export function splitMoveState(week: WeekState, oldId: string, count: number, k: number, movedId: string, restId: string, phase: (j: number) => PhaseKey | null): SplitState {
  const done = week.done || {}; const skipped = week.skipped || {};
  const at = (id: string, j: number) => `${id}#${j}`;
  const sk = (j: number) => !!skipped[at(oldId, j)];
  const dn = (j: number) => !sk(j) && (!!done[oldId] || !!done[at(oldId, j)]); // a ticked superset has every exercise ticked
  const cardSkipped = !!skipped[oldId];
  const rest = Array.from({ length: count }, (_, j) => j).filter(j => j !== k);
  const patch: WeekPatch = { done: {}, skipped: {}, ph: {} };
  const setTrue = (m: Record<string, true | null>, key: string, on: boolean) => { if (on) m[key] = true; };
  const setPh = (key: string, v: PhaseKey | null) => { if (v) patch.ph[key] = v; };
  setTrue(patch.done, movedId, dn(k)); setTrue(patch.skipped, movedId, sk(k) || cardSkipped); setPh(`${movedId}:0`, phase(k));
  if (rest.length === 1) {
    const r = rest[0]!;
    setTrue(patch.done, restId, dn(r)); setTrue(patch.skipped, restId, cardSkipped || sk(r)); setPh(`${restId}:0`, phase(r));
  } else {
    const whole = rest.every(dn);
    setTrue(patch.done, restId, whole); setTrue(patch.skipped, restId, cardSkipped);
    rest.forEach((j, n) => { setTrue(patch.done, at(restId, n), !whole && dn(j)); setTrue(patch.skipped, at(restId, n), sk(j)); setPh(`${restId}:${n}`, phase(j)); });
  }
  const undo: WeekPatch = { done: {}, skipped: {}, ph: {} };
  (['done', 'skipped', 'ph'] as const).forEach(f => Object.keys(patch[f]).forEach(key => { (undo[f] as Record<string, null>)[key] = null; }));
  return { patch, undo, keys: [...Object.keys(patch.done), ...Object.keys(patch.skipped), ...Object.keys(patch.ph)] };
}

