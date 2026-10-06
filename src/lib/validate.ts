/* ---------- Validation rules: one place for every limit ----------
   Pure predicates over numbers (already converted with Number()), so the store, the file importers and any future
   backend can share the same rules. Each one is false for NaN and Infinity. */

import { PH_KEYS, hasValidDays } from './data.js';
import type { BodyEntry, LibraryItem, LogEntry, LogSet, Program, ProgramDay, ProgramItem, ProgramSlot, SlotType } from '../types.ts';

export const LIMITS: Record<string, Record<string, number>> = {
  bodyLb: { max: 1500 },        // body weight and body-weight target, exclusive
  liftGoalLb: { max: 5000 },    // a lift goal, exclusive
  rest: { min: 0, max: 600 },   // rest timer, seconds
  pct: { min: 0, max: 110 },    // a phase's percent of 1RM
  oz: { max: 200 },             // one drink
  waterGoal: { min: 8, max: 500 },
};

const fin = (n: unknown): n is number => Number.isFinite(n);
export const validBodyLb = (n: unknown) => fin(n) && n > 0 && n < LIMITS.bodyLb.max;
export const validLiftGoalLb = (n: unknown) => fin(n) && n > 0 && n < LIMITS.liftGoalLb.max;
export const validRest = (n: unknown) => fin(n) && n >= LIMITS.rest.min && n <= LIMITS.rest.max;
export const validPct = (n: unknown) => fin(n) && n >= LIMITS.pct.min && n <= LIMITS.pct.max;
export const validRm = (n: unknown) => fin(n) && n > 0;
export const validMode = (n: unknown) => n === 1 || n === 2 || n === 3;
export const validOz = (n: unknown) => fin(n) && n > 0 && n <= LIMITS.oz.max;
export const validGoal = (n: unknown) => fin(n) && n >= LIMITS.waterGoal.min && n <= LIMITS.waterGoal.max;

/* ---------- Shapes: logged sessions and body-weight entries ----------
   normEntry / normBody take anything (a file, a stored doc, a database snapshot, a form) and return the clean shape,
   or null when it can't be used. A bad number is dropped to null rather than losing the whole session; only a bad
   date, which the app can't place on a week, rejects the entry. */
LIMITS.setLb = { max: 5000 };    // one set's weight, exclusive
LIMITS.reps = { max: 1000 };
LIMITS.hold = { max: 86400 };    // seconds
LIMITS.sets = { max: 200 };
LIMITS.text = { note: 500, id: 100, slot: 80 };

// Version of the stored document shapes (logs, body, library, experiments). Bump when a shape changes, so a migration knows what it is reading.
export const SCHEMA_VERSION = 1;
// When a record was last changed by the user: an ISO date-time. Lets a merge (or a server) tell which of two copies is newer.
export const nowStamp = () => new Date().toISOString();
export const validStamp = (s: unknown): s is string => typeof s === 'string' && s.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s));
const stampOf = (e: Obj) => (validStamp(e.updatedAt) ? e.updatedAt : undefined);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const validDate = (s: unknown): s is string => {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d));
  return y >= 1970 && y <= 2200 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
export const validSetWeight = (n: unknown) => fin(n) && n >= 0 && n < LIMITS.setLb.max;
export const validReps = (n: unknown) => fin(n) && n >= 0 && n <= LIMITS.reps.max;
export const validHold = (n: unknown) => fin(n) && n >= 0 && n <= LIMITS.hold.max;
export const validSetCount = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= LIMITS.sets.max;

// '' / null → null; a number or numeric string that passes `ok` → the number; anything else → undefined (invalid).
type Obj = Record<string, any>;
const cleanNum = (v: unknown, ok: (n: number) => boolean): number | null | undefined => {
  if (v === '' || v == null) return null;
  if (typeof v === 'string' && !v.trim()) return null;
  if (typeof v !== 'number' && typeof v !== 'string') return undefined;
  const n = Number(v); return ok(n) ? n : undefined;
};
const text = (v: unknown, max: number) => (typeof v === 'string' && v.length ? v.slice(0, max) : undefined);
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

const SET_FIELDS: [keyof LogSet, (n: unknown) => boolean][] = [['w', validSetWeight], ['r', validReps], ['sec', validHold]];
function normSet(x: unknown): LogSet | null {
  if (!isObj(x)) return null;
  const out: LogSet = {};
  SET_FIELDS.forEach(([k, ok]) => { if (k in x) { const v = cleanNum(x[k], ok); out[k] = v === undefined ? null : v; } });
  return out;
}

export function normEntry(e: unknown): LogEntry | null {
  if (!isObj(e) || !validDate(e.d)) return null;
  const out: LogEntry = { d: e.d };
  if ('ph' in e) out.ph = PH_KEYS.includes(e.ph) ? e.ph : null;
  const numFields: ['w' | 's' | 'r' | 'sec', (n: unknown) => boolean][] = [['w', validSetWeight], ['s', validSetCount], ['r', validReps], ['sec', validHold]];
  numFields.forEach(([k, ok]) => {
    if (k in e) { const v = cleanNum(e[k], ok); out[k] = v === undefined ? null : v; }
  });
  if (Array.isArray(e.sets)) { const sets = e.sets.slice(0, LIMITS.sets.max).map(normSet).filter((s): s is LogSet => !!s); if (sets.length) out.sets = sets; }
  const n = text(e.n, LIMITS.text.note); if (n) out.n = n;
  const slot = text(e.slot, LIMITS.text.slot); if (slot) out.slot = slot;
  if (validDate(e.wk)) out.wk = e.wk;
  const id = text(e.id, LIMITS.text.id); if (id) out.id = id;
  if (e.auto === true) out.auto = true;
  const at = stampOf(e); if (at) out.updatedAt = at;
  return out;
}
export const normEntries = (list: unknown): LogEntry[] => (Array.isArray(list) ? list : []).map(normEntry).filter((e): e is LogEntry => !!e);

// [{wk, d, w}], one per week, oldest data first as given.
export function normBody(list: unknown): BodyEntry[] {
  const out: BodyEntry[] = [];
  (Array.isArray(list) ? list : []).forEach(e => {
    if (!isObj(e) || !validDate(e.wk) || !validDate(e.d) || out.some(x => x.wk === e.wk)) return;
    const w = cleanNum(e.w, validBodyLb); if (w == null) return;
    const at = stampOf(e);
    out.push({ wk: e.wk, d: e.d, w, ...(at ? { updatedAt: at } : {}) });
  });
  return out;
}

// A message for the first out-of-range set in a form, or '' when they are all fine.
export function setError(sets: LogSet[], iso?: boolean): string {
  for (const x of sets) {
    if (x.w != null && !validSetWeight(x.w)) return `Weight must be between 0 and ${LIMITS.setLb.max} lb.`;
    const v = iso ? x.sec : x.r;
    if (v != null && !(iso ? validHold(v) : validReps(v))) return iso ? `Hold must be between 0 and ${LIMITS.hold.max} s.` : `Reps must be between 0 and ${LIMITS.reps.max}.`;
  }
  return '';
}

/* ---------- Programs and saved versions ----------
   A program is {days: [{title, sub?, makeup?, slots: [{id, sec?, tier?, type?, note?, items: [{ex, ph, w, bw?, rx?, note?}]}]}],
   warm?, sledAdded?, sledTop?}; a saved version wraps one as {id, name, from?, at, auto?, created?, prog}. Invalid items and
   slots are dropped; a slot with no id gets the one the app would derive from its position, before anything is dropped, so
   the ids of the slots after it (which check-offs and logs point at) don't shift. */
LIMITS.program = { slots: 40, items: 12, title: 60, sub: 100, label: 40, rx: 60, note: 200, name: 100 };
const ID_RE = /^[\w.~:@+-]{1,100}$/;
const EX_RE = /^[\w.~:@+-]{1,200}$/;
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const idOk = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v) && !UNSAFE.has(v);
const SLOT_TYPES: SlotType[] = ['single', 'superset', 'either'];

function normItem(it: unknown): ProgramItem | null {
  if (!isObj(it) || typeof it.ex !== 'string' || !EX_RE.test(it.ex) || UNSAFE.has(it.ex)) return null;
  const w = cleanNum(it.w, validSetWeight);
  const out: ProgramItem = { ex: it.ex, ph: PH_KEYS.includes(it.ph) ? it.ph : null, w: w === undefined ? null : w };
  if (it.bw === true) out.bw = true;
  const rx = text(it.rx, LIMITS.program.rx); if (rx) out.rx = rx;
  const note = text(it.note, LIMITS.program.note); if (note) out.note = note;
  return out;
}
function normSlot(s: unknown, id: string): ProgramSlot | null {
  if (!isObj(s) || !Array.isArray(s.items)) return null;
  const items = s.items.slice(0, LIMITS.program.items).map(normItem).filter((x): x is ProgramItem => !!x);
  if (!items.length) return null;
  const out: Partial<ProgramSlot> = { id };
  const sec = text(s.sec, LIMITS.program.label); if (sec) out.sec = sec;
  const tier = text(s.tier, LIMITS.program.label); if (tier) out.tier = tier;
  if (SLOT_TYPES.includes(s.type)) out.type = s.type;
  const note = text(s.note, LIMITS.program.note); if (note) out.note = note;
  out.items = items;
  return out as ProgramSlot;
}
// The cleaned program, or null when it has the wrong shape (callers then fall back to the built-in one). `key` is the
// program's owner ('A', 'B' or a saved version's id) and is only used to derive missing slot ids.
export function normProgram(input: unknown, key?: string): Program | null {
  if (!hasValidDays(input)) return null;
  const p = input as Obj;
  const k = key || (p.key === 'A' || p.key === 'B' ? p.key : 'N');
  const seen = new Set();
  const days = p.days.map((d: unknown, di: number): ProgramDay => {
    const day = isObj(d) ? d : {};
    const out: ProgramDay = { title: text(day.title, LIMITS.program.title) || `Day ${di + 1}`, slots: [] };
    const sub = text(day.sub, LIMITS.program.sub); if (sub) out.sub = sub;
    if (day.makeup === true) out.makeup = true;
    (Array.isArray(day.slots) ? day.slots.slice(0, LIMITS.program.slots) : []).forEach((s: unknown, si: number) => {
      let id = isObj(s) && idOk(s.id) ? s.id : `${k}-d${di + 1}s${si + 1}`;
      while (seen.has(id)) id += '_';
      const x = normSlot(s, id); if (x) { seen.add(id); out.slots.push(x); }
    });
    return out;
  });
  const out: Program = { days };
  if (p.key === 'A' || p.key === 'B') out.key = p.key;
  const warm = text(p.warm, LIMITS.program.note); if (warm) out.warm = warm;
  if (p.sledAdded === true) out.sledAdded = true;
  if (p.sledTop === true) out.sledTop = true;
  return out;
}
export function normLibrary(list: unknown): LibraryItem[] {
  const seen = new Set<string>(); const out: LibraryItem[] = [];
  (Array.isArray(list) ? list : []).forEach(it => {
    if (!isObj(it) || !idOk(it.id) || seen.has(it.id)) return;
    const prog = normProgram(it.prog, it.id); if (!prog) return;
    seen.add(it.id);
    const x: Partial<LibraryItem> = { id: it.id, name: text(it.name, LIMITS.program.name) || 'Saved version' };
    if (it.from === 'A' || it.from === 'B') x.from = it.from;
    x.at = text(it.at, 40) || '';
    if (it.auto === true) x.auto = true;
    if (it.created === true) x.created = true;
    x.prog = prog; out.push(x as LibraryItem);
  });
  return out;
}
