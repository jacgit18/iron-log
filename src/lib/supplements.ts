
import type { SupplementItem, SupplementSlot, Taken } from '../types.ts';

/* ---------- Supplements: the library and the daily schedule ----------
   items: [{id, n, dose, note, slot}]. slot 'morning' | 'noon' | 'night' puts it on the Supplements tab every day;
   '' keeps it in the library only. Order in the array is the order shown.
   taken: {"YYYY-MM-DD": {<id>: true}}, what was ticked off on each day. */

export const SLOTS: [SupplementSlot, string][] = [['morning', 'Morning'], ['noon', 'Noon'], ['night', 'Night']];
export const SLOT_OPTIONS: [SupplementSlot, string][] = [...SLOTS, ['', 'Library only']];
export const slotLabel = (k: string) => (SLOT_OPTIONS.find(([x]) => x === k) || SLOT_OPTIONS[3])[1];
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const cleanItem = (x: any, slot: SupplementSlot): SupplementItem => ({ id: x.id, n: str(x.n, 60), slot, ...(str(x.dose, 40) ? { dose: str(x.dose, 40) } : {}), ...(str(x.note, 200) ? { note: str(x.note, 200) } : {}) });
// A saved doc's items. Docs saved before the library had a `schedule` with three lists; those become items in the same order.
export function normItems(d: any): SupplementItem[] {
  const raw: [any, any][] = Array.isArray(d && d.items) ? d.items.map((x: any) => [x, x && x.slot])
    : SLOTS.flatMap(([k]) => (d && d.schedule && Array.isArray(d.schedule[k]) ? d.schedule[k] : []).map(x => [x, k]));
  const seen = new Set<string>(); const out: SupplementItem[] = [];
  raw.forEach(([x, slot]: [any, any]) => {
    if (!x || typeof x !== 'object' || !str(x.id, 60) || !str(x.n, 60) || seen.has(x.id)) return;
    seen.add(x.id); out.push(cleanItem(x, SLOTS.some(([k]) => k === slot) ? slot : ''));
  });
  return out;
}
export const scheduleOf = (items: SupplementItem[]) => Object.fromEntries(SLOTS.map(([k]) => [k, items.filter(i => i.slot === k)]));
export function normTaken(t: any): Taken {
  const out: Taken = {};
  if (!t || typeof t !== 'object') return out;
  Object.keys(t).forEach(d => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !t[d] || typeof t[d] !== 'object') return;
    const ids = Object.keys(t[d]).filter(id => t[d][id]);
    if (ids.length) out[d] = Object.fromEntries(ids.map(id => [id, true]));
  });
  return out;
}
export const scheduled = (items: SupplementItem[]) => items.filter(i => i.slot);
export function slotTally(items: SupplementItem[], taken: Taken, date: string, slot: string) {
  const l = items.filter(i => i.slot === slot); const t = taken[date] || {};
  const done = l.filter(x => t[x.id]).length;
  return { done, total: l.length, full: l.length > 0 && done === l.length };
}
export function newSupplementId(items: SupplementItem[], name: unknown) {
  const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'supplement';
  const taken = new Set(items.map(i => i.id)); let id = base, n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}
