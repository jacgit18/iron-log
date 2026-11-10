import type { SupplementItem, SupplementSlot } from '../types.ts';
import { slotLabel } from './supplements.js';

// What adding one of your own supplements to a time of day does (brief supplement-add-redesign): a library-only one moves in; one already
// scheduled elsewhere gets another instance (taken twice a day); one already in that time of day is left alone.
export type AddPlan = { kind: 'move'; id: string } | { kind: 'instance'; id: string } | { kind: 'exists'; message: string };

const same = (a: SupplementItem, b: SupplementItem) => a.n.toLowerCase() === b.n.toLowerCase() && (a.brand || '').toLowerCase() === (b.brand || '').toLowerCase();

export function planAddMine(items: SupplementItem[], id: string, slot: SupplementSlot): AddPlan | null {
  const picked = items.find(i => i.id === id);
  if (!picked) return null;
  const copies = items.filter(i => same(i, picked));
  if (!slot) return { kind: 'exists', message: 'It is already in your library. Pick Morning, Noon or Night to schedule it.' };
  if (copies.some(i => i.slot === slot)) return { kind: 'exists', message: `${picked.n} is already in ${slotLabel(slot)}.` };
  const libraryOnly = copies.find(i => !i.slot);
  return libraryOnly ? { kind: 'move', id: libraryOnly.id } : { kind: 'instance', id: picked.id };
}
