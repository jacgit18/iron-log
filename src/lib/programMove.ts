import type { Cfg, LibraryItem, PhaseKey, Program, ProgramSlot } from '../types.ts';
import { exInfo } from './data.js';
import { itemKey, progName } from './logic.js';

// Moving a card to another program and day (Program tab > Move…). Pure helpers: which programs can be a target, where the sheet opens,
// the line that says where the card will land, and the new id and phase defaults a card takes into another program (ADR 070).
// Program keys are the editor's own: 'A', 'B', or 'L:<library id>'.

export interface MoveTarget { key: string; label: string; onBoard: boolean }
export interface MovePreview { line: string; same: boolean; notes: string[] }

// A card's name for lists, notices and button names: the exercise, or the exercises joined for a superset or an either/or card.
export function slotSummary(cfg: Cfg, sl: ProgramSlot): string {
  const names = sl.items.map(i => exInfo(cfg, i.ex).n);
  return sl.type === 'superset' ? names.join(' → ') : sl.type === 'either' ? names.join(' or ') : names[0]!;
}

export const isLibKey = (key: string) => key.startsWith('L:');

// The program a key names, or null when a saved program has been deleted.
export function programByKey(programs: Record<string, Program | undefined>, library: LibraryItem[], key: string): Program | null {
  if (!isLibKey(key)) return programs[key] ?? null;
  const it = library.find(x => 'L:' + x.id === key);
  return it ? { ...it.prog, key: 'N' } : null;
}

// A and B, then the saved programs by name. Only A and B can be on the board; a saved program waits until it is loaded.
export function moveTargets(cfg: Cfg, library: LibraryItem[]): MoveTarget[] {
  return [
    ...(['A', 'B'] as const).map(key => ({ key, label: progName(cfg, key), onBoard: true })),
    ...library.map(it => ({ key: 'L:' + it.id, label: it.name, onBoard: false })),
  ];
}

// The sheet opens on the card's own program and the next day; Day 7 wraps to Day 1.
export const defaultDestination = (fromKey: string, fromDay: number): { key: string; day: number } => ({ key: fromKey, day: (fromDay % 7) + 1 });

export interface PreviewInput {
  slot: ProgramSlot;
  fromKey: string;
  fromDay: number;
  to: MoveTarget;
  toDay: number;
  /** The cards already on the target day, so the preview can say the same exercise is there. */
  targetSlots: ProgramSlot[];
}

// Where the card will land, said before Move is pressed. It never promises this week's ticks: a card in another program is a new card.
export function movePreview({ slot, fromKey, fromDay, to, toDay, targetSlots }: PreviewInput): MovePreview {
  const same = to.key === fromKey && toDay === fromDay;
  if (same) return { line: 'It is already there.', same, notes: [] };
  const where = `${to.label} · Day ${toDay}`;
  const line = slot.sec ? `Lands at the end of ${slot.sec} on ${where}.` : `Lands at the end of ${where}.`;
  const notes: string[] = [];
  const there = new Set(targetSlots.flatMap(s => s.items.map(it => it.ex)));
  if (slot.items.some(it => there.has(it.ex))) notes.push('Already on this day.');
  if (to.key !== fromKey) notes.push('Keeps its sets and phase; this week’s ticks stay behind.');
  if (!to.onBoard) notes.push('Not on your board until you load it.');
  return { line, same, notes };
}

// A card keeps its id inside one program. In another program it needs a new one, because ticks and phase defaults are keyed by id.
// `suffix` is any short unique text (time and random in the store, fixed in tests).
export const moveSlotId = (toKey: string, suffix: string) => `${isLibKey(toKey) ? 'N' : toKey}-x${suffix}`;

// The saved phase defaults of a card under its old id, written under its new id. Items without one are left out.
export function carryPhDef(phDef: Record<string, PhaseKey | null>, oldId: string, newId: string, itemCount: number): Record<string, PhaseKey | null> {
  const out: Record<string, PhaseKey | null> = {};
  for (let i = 0; i < itemCount; i++) {
    const v = phDef[itemKey({ id: oldId }, i)];
    if (v) out[itemKey({ id: newId }, i)] = v;
  }
  return out;
}

// Taking one exercise out of a superset and putting it on another day (Program tab > the exercise's own Move to day). Supersets only: an
// either/or card is one choice, so it moves whole. The exercise becomes a card of its own with a new id; the card it left keeps its id,
// and a superset left with one exercise becomes a plain card. Both move out of the "Supersets" section, which now holds neither.
export interface SupersetSplit { rest: ProgramSlot; moved: ProgramSlot }

export function splitSuperset(slot: ProgramSlot, k: number, newId: string): SupersetSplit | null {
  if (slot.type !== 'superset' || slot.items.length < 2 || !slot.items[k]) return null;
  const plain = (sec?: string) => (sec === 'Supersets' ? 'Regular' : sec);
  const rest: ProgramSlot = { ...structuredClone(slot), items: slot.items.filter((_, i) => i !== k).map(it => structuredClone(it)) };
  if (rest.items.length === 1) { delete rest.type; if (rest.sec) rest.sec = plain(rest.sec); }
  const moved: ProgramSlot = { id: newId, items: [structuredClone(slot.items[k]!)] };
  if (slot.sec) moved.sec = plain(slot.sec);
  if (slot.tier) moved.tier = slot.tier;
  if (slot.from) moved.from = slot.from;
  return { rest, moved };
}

// Phase defaults are keyed `<card id>:<position>`, so when an exercise leaves, the ones after it shift up and the moved one gets its new
// id. `del` lists every old key of the card; `set` is what to write. `before` is the old values, so Undo can restore them.
export function splitPhDef(phDef: Record<string, PhaseKey | null>, oldId: string, count: number, k: number, newId: string) {
  const del: string[] = []; const set: Record<string, PhaseKey | null> = {}; const before: Record<string, PhaseKey | null> = {};
  for (let j = 0; j < count; j++) {
    const key = itemKey({ id: oldId }, j); const v = phDef[key];
    del.push(key);
    if (v) before[key] = v;
    if (!v) continue;
    if (j === k) set[itemKey({ id: newId }, 0)] = v;
    else set[itemKey({ id: oldId }, j > k ? j - 1 : j)] = v;
  }
  return { del, set, before };
}
