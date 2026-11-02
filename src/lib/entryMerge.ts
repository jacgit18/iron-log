/* ---------- Which entries, weeks and programs are the same one, and how two copies merge ----------
   Moved out of export.ts unchanged so the store, sync and sheets do not load the file builders and parsers at startup. */
import { fmtShort } from '../shared/dates.js';
import type { DataFile, LogEntry, Week } from '../types.ts';
import { normWeek, touched } from './logic.js';
import { weekOfDate } from './trends.js';
import { validStamp } from '../shared/validate.js';

/* ---------- Programs in the library ---------- */
export const progBody = <T extends { key?: unknown }>(p: T): Omit<T, 'key'> => { const { key: _key, ...b } = structuredClone(p); return b; }; // eslint-disable-line no-unused-vars
export const sameProg = (a: { key?: unknown }, b: { key?: unknown }) => JSON.stringify(progBody(a)) === JSON.stringify(progBody(b));
export const libDate = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : `${fmtShort(d)}, ${d.getFullYear()}`; };

// Import choices follow the app's tabs. Board: check-offs, body weight, exercises to try. Progress: logged sessions.
// Muscles: muscle tags. Program: edited programs, saved versions, custom exercises. Settings: everything else in the config.
export const IMPORT_SECTIONS = [['board', 'Board'], ['progress', 'Progress'], ['muscles', 'Muscles'], ['program', 'Program'], ['stretches', 'Stretches'], ['supplements', 'Supplements'], ['grocery', 'Groceries'], ['recipes', 'Recipes'], ['diet', 'Food log'], ['settings', 'Settings']];
export const importSel = (draft: { sel?: Record<string, boolean> }) => Object.fromEntries(IMPORT_SECTIONS.map(([k]) => [k, !draft.sel || draft.sel[k] !== false]));
export const cfgSection = (k: string) => (k === 'muscleMap' ? 'muscles' : ['ex', 'progNames', 'phDef', 'exPh'].includes(k) ? 'program' : 'settings');
/* ---------- Which logged sessions are the same one ----------
   An entry's values in a fixed field order, so the same session matches however its fields were written (a workbook
   rebuilds entries in another key order). The id is left out, and a stored `wk` that is just the week of the date
   carries no information. */
const kv = (v: unknown) => (v === '' || v == null ? null : Number(v));
export const sameKey = (e: LogEntry) => JSON.stringify([e.d, e.ph || null, kv(e.w), kv(e.s), kv(e.r), kv(e.sec),
  Array.isArray(e.sets) && e.sets.length ? e.sets.map(x => [kv(x.w), kv(x.r), kv(x.sec)]) : null,
  e.n || null, !!e.auto, e.slot || null, e.wk && e.wk !== weekOfDate(e.d) ? e.wk : null]);
const hash = (t: string) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h.toString(36); };
// An entry's identity: its id, or for one saved before entries had ids, a hash of its values. Editing such an entry
// stores that hash as its id, so an older copy of it (from a backup) is still known as the same session.
export const entryId = (e: LogEntry) => e.id || 'k' + hash(sameKey(e));
// Where `target` (an entry as it was read) is in list L now, or -1 if it is gone or changed meanwhile.
export const findEntry = (L: LogEntry[], target: LogEntry) => (target.id ? L.findIndex(x => x.id === target.id) : L.findIndex(x => !x.id && sameKey(x) === sameKey(target)));
// Adds b's entries that a doesn't have. A check-off (auto) entry is one per card and week: it isn't added next to
// any entry for that card and week, and a session logged by hand replaces it, as on the board.
// Same id on both sides: this device's copy stays, unless both carry an updatedAt and the incoming one is later (it was edited
// after this one), in which case it replaces it. Copies without a timestamp (older data, Excel files) never replace anything.
// Entries it leaves alone are returned as the same objects: `entriesChanged` (below) tells a change by identity, so do not copy them here.
export function mergeEntries(a: LogEntry[], b: LogEntry[]) {
  let out = [...a]; const ids = new Set(a.map(entryId)); const keys = new Set(a.map(sameKey));
  b.forEach(e => {
    const id = entryId(e);
    if (ids.has(id)) {
      const i = out.findIndex(x => entryId(x) === id);
      if (i >= 0 && newer(e, out[i])) { out[i] = { ...e, id }; keys.add(sameKey(e)); }
      return;
    }
    if (keys.has(sameKey(e))) return;
    const card = (x: LogEntry) => !!(e.slot && e.wk) && x.slot === e.slot && x.wk === e.wk;
    if (e.auto && out.some(card)) return;
    if (!e.auto) out = out.filter(x => !(x.auto && card(x)));
    out.push(e); ids.add(id); keys.add(sameKey(e));
  });
  return out.sort((x, y) => x.d.localeCompare(y.d)); // sort-ok: ISO date strings
}
// True when a merge changed the list: an entry was added, replaced or dropped. mergeEntries keeps every untouched entry as the same
// object, so identity is the test; a count alone misses a copy replaced by a newer one and a check-off swapped for a real session.
export const entriesChanged = (before: LogEntry[], after: LogEntry[]) => {
  const kept = new Set(before);
  return before.length !== after.length || after.some(e => !kept.has(e));
};
const newer = (x: LogEntry, y: LogEntry) => validStamp(x.updatedAt) && validStamp(y.updatedAt) && Date.parse(x.updatedAt) > Date.parse(y.updatedAt);
export function mergeWeek(a: unknown, b: unknown): Week {
  const w = normWeek(a); const o = normWeek(b);
  w.prog = w.prog || o.prog;
  if (!w.rest && o.rest) w.rest = o.rest;
  if (w.rest && !w.restOn && o.restOn && JSON.stringify(o.rest) === JSON.stringify(w.rest)) w.restOn = o.restOn;
  if (!w.order && o.order) w.order = o.order;
  (['moved', 'ph'] as const).forEach(k => { (w as any)[k] = { ...o[k], ...w[k] }; });
  Object.keys(o.warm).forEach(d => { w.warm[d] = { ...o.warm[d], ...(w.warm[d] || {}) }; });
  const have = new Set((w.extra || []).map(x => x.id)); const more = (o.extra || []).filter(x => !have.has(x.id)); if (more.length) w.extra = [...(w.extra || []), ...more];
  const haveSplit = new Set((w.split || []).flatMap(x => [x.id, x.rest])); const haveFrom = new Set((w.split || []).map(x => x.from)); const moreSplit = (o.split || []).filter(x => !haveSplit.has(x.id) && !haveSplit.has(x.rest) && !haveFrom.has(x.from)); if (moreSplit.length) w.split = [...(w.split || []), ...moreSplit];
  w.done = { ...o.done, ...w.done }; w.skipped = { ...o.skipped, ...w.skipped }; Object.keys(w.done).forEach(id => delete w.skipped[id]);
  // What the week ran (ADR 022): this device's record, else the other's. With the same program, a card only the other record has stays
  // when the merged week ticked, skipped or moved it, so that check-off still counts.
  if (!w.ran && o.ran) w.ran = o.ran;
  else if (w.ran && o.ran && w.ran.prog === o.ran.prog) {
    const have = new Set(w.ran.program.days.flatMap(d => d.slots.map(s => s.id)));
    o.ran.program.days.forEach((d, di) => d.slots.forEach(s => { if (!have.has(s.id) && touched(s, w) && w.ran!.program.days[di]) w.ran!.program.days[di].slots.push(s); }));
  }
  return w;
}


export function dataStats(d: Partial<DataFile>) {
  const L = Object.values(d.logs || {}); const sets = L.reduce((a, l) => a + l.length, 0);
  return { entries: sets, exercises: L.filter(l => l.length).length, weeks: Object.keys(d.weeks || {}).length, programs: Object.keys(d.programs || {}), saved: (d.library || []).length, body: (d.body || []).length, experiments: (d.experiments || []).length, stretches: d.stretches ? d.stretches.items.length : 0, stretchWeeks: Object.keys(d.stretchWeeks || {}).length, waterDays: d.supplements ? Object.keys(d.supplements.water).length : 0, groceryItems: d.grocery ? d.grocery.items.length : 0, groceryMonths: d.grocery ? Object.keys(d.grocery.months).length : 0, dietEntries: (d.diet || []).length };
}
