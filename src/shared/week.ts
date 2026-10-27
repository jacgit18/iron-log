import { PH_KEYS, DAY_COUNT } from '../lib/data.js';
import { normItem, normProgram } from './validate.js';
import type { ExtraCard, SplitCard, Week, WeekLayout } from '../types.ts';

/* ---------- Week shape: the week's check-offs, moves, phase picks and extra cards ----------
   normWeek takes anything (a stored doc, a file, a database snapshot) and returns the clean week. Framework-free, so the
   client and the API share it (ADR 015). */

// week.order[i] = the program day shown at workout position i + 1 (absent = normal order).
export const isOrder = (o: unknown): o is number[] => Array.isArray(o) && o.length === DAY_COUNT && o.every(v => Number.isInteger(v) && v >= 1 && v <= DAY_COUNT) && new Set(o).size === DAY_COUNT;

/* ---------- Experiment cards (week.extra) ---------- */
const isExtra = (x: any): x is ExtraCard => !!x && typeof x.id === 'string' && /^X-[\w-]{1,60}$/.test(x.id) && Number.isInteger(x.day) && x.day >= 1 && x.day <= DAY_COUNT && typeof x.ex === 'string' && x.ex !== '' && (x.ph == null || PH_KEYS.includes(x.ph)) && (x.note == null || typeof x.note === 'string') && (x.add == null || typeof x.add === 'boolean');

/* ---------- Superset exercises moved to another day for one week (week.split) ---------- */
const SPLIT_ID = /^[\w.~:@+-]{1,100}$/;
const SPLIT_MAX = 40;
// The valid entries in order, each id once. A card that names an id twice, a position outside a superset or a day outside the week is dropped.
export const normSplit = (list: unknown): SplitCard[] => {
  const seen = new Set<string>(); const out: SplitCard[] = [];
  (Array.isArray(list) ? list : []).forEach((x: any) => {
    if (out.length >= SPLIT_MAX || !x || typeof x !== 'object') return;
    const ids = [x.id, x.from, x.rest];
    if (!ids.every(v => typeof v === 'string' && SPLIT_ID.test(v) && !['__proto__', 'constructor', 'prototype'].includes(v)) || x.id === x.rest || seen.has(x.id) || seen.has(x.rest)) return;
    if (!Number.isInteger(x.k) || x.k < 0 || x.k > 19 || !Number.isInteger(x.day) || x.day < 1 || x.day > DAY_COUNT) return;
    const item = normItem(x.item); if (!item) return;
    seen.add(x.id); seen.add(x.rest); out.push({ id: x.id, from: x.from, rest: x.rest, k: x.k, day: x.day, item });
  });
  return out;
};

// A plain object's entries as a new object, keeping the ones `f(value)` maps to something (not undefined). Keys must look
// like the app's own (card keys such as "A-d1s1:0" or "ss#0", day and warm-up ids): short, no control characters, not a prototype key.
// oxlint-disable-next-line no-control-regex
const KEY_RE = /^[^\x00-\x1f]{1,100}$/;
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const cleanMap = <T>(o: unknown, f: (v: any) => T | undefined): Record<string, T> => {
  const out: Record<string, T> = {};
  if (o && typeof o === 'object' && !Array.isArray(o)) Object.entries(o as object).forEach(([k, v]) => { if (KEY_RE.test(k) && !UNSAFE.has(k)) { const x = f(v); if (x !== undefined) out[k] = x; } });
  return out;
};
const flagOf = (v: unknown) => (v ? true : undefined);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// The rest dates of a stored week: a map from rest column to date, or the one string older files kept (the first rest day's date).
// Only dates of columns that are rest days are kept.
export const restDatesIn = (v: unknown, rest: number[] | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!rest || !rest.length) return out;
  if (typeof v === 'string') { if (DATE_RE.test(v)) out[String(rest[0])] = v; return out; }
  if (v && typeof v === 'object' && !Array.isArray(v)) rest.forEach(r => { const t = (v as Record<string, unknown>)[String(r)]; if (typeof t === 'string' && DATE_RE.test(t)) out[String(r)] = t; });
  return out;
};
// Which program day each in-place rest displaced (rest column to day 1..DAY_COUNT); only rest columns are kept.
export const restTookIn = (v: unknown, rest: number[] | undefined): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!rest || !rest.length || !v || typeof v !== 'object' || Array.isArray(v)) return out;
  rest.forEach(r => { const d = (v as Record<string, unknown>)[String(r)]; if (Number.isInteger(d) && (d as number) >= 1 && (d as number) <= DAY_COUNT) out[String(r)] = d as number; });
  return out;
};
// The rest days, day order and rest date of a stored week (or of one program's stash entry), cleaned.
const layoutOf = (w: any): WeekLayout => {
  const out: WeekLayout = {};
  const rest = [...new Set([].concat((w && w.rest) ?? []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= DAY_COUNT))].sort((a, b) => a - b);
  if (rest.length) out.rest = rest;
  if (isOrder(w && w.order) && w.order.some((v: number, i: number) => v !== i + 1)) out.order = [...w.order];
  const dates = restDatesIn(w && w.restOn, out.rest);
  if (Object.keys(dates).length) out.restOn = dates;
  const took = restTookIn(w && w.restTook, out.rest);
  if (Object.keys(took).length) out.restTook = took;
  return out;
};
export const normWeek = (w?: any): Week => {
  const out: Week = { prog: w && (w.prog === 'A' || w.prog === 'B') ? w.prog : null, done: cleanMap(w && w.done, flagOf), skipped: cleanMap(w && w.skipped, flagOf), moved: cleanMap(w && w.moved, v => v), ph: cleanMap(w && w.ph, v => (PH_KEYS.includes(v) ? v : undefined)), warm: {} };
  Object.entries(cleanMap(w && w.warm, v => v)).forEach(([day, items]) => { const m = cleanMap(items, v => (typeof v === 'boolean' ? v : undefined)); if (Object.keys(m).length) out.warm[day] = m; });
  out.moved = Object.fromEntries(Object.entries(out.moved).map(([k, v]) => [k, Number(v)] as [string, number]).filter(([, v]) => Number.isInteger(v) && v >= 1 && v <= DAY_COUNT));
  Object.assign(out, layoutOf(w));
  const stash: NonNullable<Week['stash']> = {};
  for (const k of ['A', 'B'] as const) { const l = layoutOf(w && w.stash && w.stash[k]); if (Object.keys(l).length) stash[k] = l; }
  if (Object.keys(stash).length) out.stash = stash;
  const split = normSplit(w && w.split); if (split.length) out.split = split;
  // What the week ran (ADR 022): kept only with a valid program key and a program of the right shape, cleaned like any program.
  if (w && w.ran && (w.ran.prog === 'A' || w.ran.prog === 'B')) { const program = normProgram(w.ran.program, w.ran.prog); if (program) out.ran = { prog: w.ran.prog, program: { ...program, key: w.ran.prog } }; }
  if (Array.isArray(w && w.extra)) { const seen = new Set(); const ex = w.extra.filter((x: unknown) => isExtra(x) && !seen.has(x.id) && seen.add(x.id)).map((x: ExtraCard) => ({ id: x.id, day: x.day, ex: x.ex, ph: x.ph ?? null, note: (x.note || '').slice(0, 200), ...(x.add ? { add: true } : {}) })); if (ex.length) out.extra = ex; }
  return out;
};
