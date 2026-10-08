import { PH_KEYS, DAY_COUNT } from '../lib/data.js';
import type { ExtraCard, Week } from '../types.ts';

/* ---------- Week shape: the week's check-offs, moves, phase picks and extra cards ----------
   normWeek takes anything (a stored doc, a file, a database snapshot) and returns the clean week. Framework-free, so the
   client and the API share it (ADR 015). */

// week.order[i] = the program day shown at workout position i + 1 (absent = normal order).
export const isOrder = (o: unknown): o is number[] => Array.isArray(o) && o.length === DAY_COUNT && o.every(v => Number.isInteger(v) && v >= 1 && v <= DAY_COUNT) && new Set(o).size === DAY_COUNT;

/* ---------- Experiment cards (week.extra) ---------- */
const isExtra = (x: any): x is ExtraCard => !!x && typeof x.id === 'string' && /^X-[\w-]{1,60}$/.test(x.id) && Number.isInteger(x.day) && x.day >= 1 && x.day <= DAY_COUNT && typeof x.ex === 'string' && x.ex !== '' && (x.ph == null || PH_KEYS.includes(x.ph)) && (x.note == null || typeof x.note === 'string') && (x.add == null || typeof x.add === 'boolean');

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
export const normWeek = (w?: any): Week => {
  const out: Week = { prog: w && (w.prog === 'A' || w.prog === 'B') ? w.prog : null, done: cleanMap(w && w.done, flagOf), skipped: cleanMap(w && w.skipped, flagOf), moved: cleanMap(w && w.moved, v => v), ph: cleanMap(w && w.ph, v => (PH_KEYS.includes(v) ? v : undefined)), warm: {} };
  Object.entries(cleanMap(w && w.warm, v => v)).forEach(([day, items]) => { const m = cleanMap(items, v => (typeof v === 'boolean' ? v : undefined)); if (Object.keys(m).length) out.warm[day] = m; });
  out.moved = Object.fromEntries(Object.entries(out.moved).map(([k, v]) => [k, Number(v)] as [string, number]).filter(([, v]) => Number.isInteger(v) && v >= 1 && v <= DAY_COUNT));
  const rest = [...new Set([].concat((w && w.rest) ?? []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= DAY_COUNT))].sort((a, b) => a - b);
  if (rest.length) out.rest = rest;
  if (isOrder(w && w.order) && w.order.some((v: number, i: number) => v !== i + 1)) out.order = [...w.order];
  if (out.rest && typeof (w && w.restOn) === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w.restOn)) out.restOn = w.restOn;
  if (Array.isArray(w && w.extra)) { const seen = new Set(); const ex = w.extra.filter((x: unknown) => isExtra(x) && !seen.has(x.id) && seen.add(x.id)).map((x: ExtraCard) => ({ id: x.id, day: x.day, ex: x.ex, ph: x.ph ?? null, note: (x.note || '').slice(0, 200), ...(x.add ? { add: true } : {}) })); if (ex.length) out.extra = ex; }
  return out;
};
