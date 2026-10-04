/* ---------- Supplements: the library and the daily schedule ----------
   items: [{id, n, dose, note, slot}]. slot 'morning' | 'noon' | 'night' puts it on the Supplements tab every day;
   '' keeps it in the library only. Order in the array is the order shown.
   taken: {"YYYY-MM-DD": {<id>: true}}, what was ticked off on each day. */

export const SLOTS = [['morning', 'Morning'], ['noon', 'Noon'], ['night', 'Night']];
export const SLOT_OPTIONS = [...SLOTS, ['', 'Library only']];
export const slotLabel = k => (SLOT_OPTIONS.find(([x]) => x === k) || SLOT_OPTIONS[3])[1];
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const cleanItem = (x, slot) => ({ id: x.id, n: str(x.n, 60), slot, ...(str(x.dose, 40) ? { dose: str(x.dose, 40) } : {}), ...(str(x.note, 200) ? { note: str(x.note, 200) } : {}) });
// A saved doc's items. Docs saved before the library had a `schedule` with three lists; those become items in the same order.
export function normItems(d) {
  const raw = Array.isArray(d && d.items) ? d.items.map(x => [x, x && x.slot])
    : SLOTS.flatMap(([k]) => (d && d.schedule && Array.isArray(d.schedule[k]) ? d.schedule[k] : []).map(x => [x, k]));
  const seen = new Set(); const out = [];
  raw.forEach(([x, slot]) => {
    if (!x || typeof x !== 'object' || !str(x.id, 60) || !str(x.n, 60) || seen.has(x.id)) return;
    seen.add(x.id); out.push(cleanItem(x, SLOTS.some(([k]) => k === slot) ? slot : ''));
  });
  return out;
}
export const scheduleOf = items => Object.fromEntries(SLOTS.map(([k]) => [k, items.filter(i => i.slot === k)]));
export function normTaken(t) {
  const out = {};
  if (!t || typeof t !== 'object') return out;
  Object.keys(t).forEach(d => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !t[d] || typeof t[d] !== 'object') return;
    const ids = Object.keys(t[d]).filter(id => t[d][id]);
    if (ids.length) out[d] = Object.fromEntries(ids.map(id => [id, true]));
  });
  return out;
}
export const scheduled = items => items.filter(i => i.slot);
export function slotTally(items, taken, date, slot) {
  const l = items.filter(i => i.slot === slot); const t = taken[date] || {};
  const done = l.filter(x => t[x.id]).length;
  return { done, total: l.length, full: l.length > 0 && done === l.length };
}
export function newSupplementId(items, name) {
  const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'supplement';
  const taken = new Set(items.map(i => i.id)); let id = base, n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}
