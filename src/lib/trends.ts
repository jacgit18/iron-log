import type { Cfg, LogEntry, LogSet, Logs, PersonalBest, Program, Week, WeightChange } from '../types.ts';
import { BUILTIN, exInfo } from './data.js';
import { weekStartOf, ymd, parseDate, addDays } from '../shared/dates.js';
import { weekProgKey, weekProgram, weekSlots, tally, currentLayout, DAYS, isUniform } from './logic.js';
import { M_KEYS, tagsOf } from './muscles.js';

export const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;
export const weekOfDate = (d: string) => ymd(weekStartOf(parseDate(d)));
export const entryWeek = (e: LogEntry) => e.wk || weekOfDate(e.d);
export const mdLabel = (k: string) => { const d = parseDate(k); return `${d.getMonth() + 1}/${d.getDate()}`; };
const setsOf = (e: LogEntry) => { const n = Number(e.s); return n > 0 ? n : 0; };
export const niceStep = (max: number) => [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000].find(s => max / s <= 4) || 1000000;

// The weekly goal: this many full days of the week's seven.
export const WEEK_GOAL_DAYS = 6;

// Totals for any saved week, using the program that week ran: its own record once it is over (ADR 022), else today's programs.
export function weekSummary(cfg: Cfg, programs: Record<string, Program>, key: string, w: Week) {
  const start = parseDate(key);
  const pk = weekProgKey(cfg, w, key);
  const prog = weekProgram(cfg, programs, w, key) || BUILTIN.A; const slots = weekSlots(prog, w, key);
  const cols = currentLayout({ ...w, moved: w.moved || {} }, slots);
  const days = DAYS.map(d => { const t = tally(cols[d], w); return t.full ? 2 : t.done > 0 ? 1 : 0; });
  const t = tally(slots, w);
  return { key, start, pk, days, full: days.filter(x => x === 2).length, ex: t.done, total: t.total, skipped: t.skipped };
}

// Week keys for the charts: up to `max` weeks ending this week, starting no earlier than the first logged week (min `min` columns).
export function trendWeeks(logs: Logs, max: number, min: number) {
  const thisSun = ymd(weekStartOf(new Date()));
  let first = thisSun; Object.values(logs).forEach(L => L.forEach(e => { const k = entryWeek(e); if (k < first) first = k; }));
  const keys: string[] = []; let d = parseDate(thisSun);
  while (keys.length < max && (ymd(d) >= first || keys.length < min)) { keys.unshift(ymd(d)); d = addDays(d, -7); }
  return keys;
}
export function setsByWeek(logs: Logs, keys: string[]) {
  const out: Record<string, { sets: number; sessions: number }> = {}; keys.forEach(k => { out[k] = { sets: 0, sessions: 0 }; });
  Object.values(logs).forEach(L => L.forEach(e => { const r = out[entryWeek(e)]; if (r) { r.sets += setsOf(e); r.sessions++; } }));
  return out;
}
export function muscleWeeks(cfg: Cfg, logs: Logs, keys: string[]) {
  const out: Record<string, Record<string, number>> = {}; M_KEYS.forEach(m => { out[m] = {}; keys.forEach(k => { out[m][k] = 0; }); });
  Object.entries(logs).forEach(([id, L]) => {
    const tg = tagsOf(cfg, id); if (!tg || tg.mob) return;
    L.forEach(e => {
      const k = entryWeek(e); if (!(k in out[M_KEYS[0]])) return; const s = setsOf(e);
      (tg.p || []).forEach((m: string) => { if (out[m]) out[m][k] += s; }); (tg.s || []).forEach((m: string) => { if (out[m]) out[m][k] += s / 2; });
    });
  });
  return out;
}
// First vs latest working weight per exercise and phase, over the window.
export function weightChanges(cfg: Cfg, logs: Logs, sinceKey: string) {
  const rows: WeightChange[] = [];
  Object.entries(logs).forEach(([id, L]) => {
    const by: Record<string, LogEntry[]> = {}; L.forEach(e => { const w = Number(e.w); if (!(w > 0) || entryWeek(e) < sinceKey) return; (by[e.ph || ''] = by[e.ph || ''] || []).push(e); });
    Object.entries(by).forEach(([ph, E]) => {
      if (E.length < 2) return; E = [...E].sort((a, b) => a.d.localeCompare(b.d));
      const a = E[0], b = E[E.length - 1]; const w0 = Number(a.w), w1 = Number(b.w);
      if (a.d === b.d) return;
      rows.push({ id, ph: ph || null, w0, w1, d0: a.d, d1: b.d, n: E.length, pct: (w1 - w0) / w0 * 100 });
    });
  });
  return rows.sort((x, y) => y.pct - x.pct || exInfo(cfg, x.id).n.localeCompare(exInfo(cfg, y.id).n));
}

/* ---------- Volume (sets × reps × weight) and personal bests ---------- */
const pos = (v: unknown) => { const n = Number(v); return n > 0 ? n : 0; };
// The sets of a session as weight and reps. A uniform session is its summary (s sets of r at w); otherwise each set.
// Timed sets have no reps, so they add no volume and are never a best.
function setsWR(e: LogEntry): { w: number; r: number }[] {
  if (isUniform(e)) { const n = setsOf(e); const w = pos(e.w), r = e.sec ? 0 : pos(e.r); return Array.from({ length: n }, () => ({ w, r })); }
  return (e.sets as LogSet[]).map(x => ({ w: pos(x.w), r: x.sec ? 0 : pos(x.r) }));
}
/** Pounds moved in one session: weight × reps over its sets. Bodyweight and timed sets count 0. Check-offs count (the sets were done). */
export const entryVolume = (e: LogEntry) => setsWR(e).reduce((a, x) => a + x.w * x.r, 0);

/** Volume per week for `keys`: all exercises (`total`) and per muscle, primary in full and secondary at half, as the sets charts do. */
export function volumeByWeek(cfg: Cfg, logs: Logs, keys: string[]) {
  const total: Record<string, number> = {}; const muscle: Record<string, Record<string, number>> = {};
  keys.forEach(k => { total[k] = 0; }); M_KEYS.forEach(m => { muscle[m] = {}; keys.forEach(k => { muscle[m][k] = 0; }); });
  Object.entries(logs).forEach(([id, L]) => {
    const tg = tagsOf(cfg, id);
    L.forEach(e => {
      const k = entryWeek(e); if (!(k in total)) return; const v = entryVolume(e); if (!v) return;
      total[k] += v;
      if (!tg || tg.mob) return;
      (tg.p || []).forEach((m: string) => { if (muscle[m]) muscle[m][k] += v; }); (tg.s || []).forEach((m: string) => { if (muscle[m]) muscle[m][k] += v / 2; });
    });
  });
  return { total, muscle };
}

// A session's top set: the heaviest weight, then the most reps at it. Null when no set has both.
function topSet(e: LogEntry) {
  let best: { w: number; r: number } | null = null;
  setsWR(e).forEach(x => { if (x.w > 0 && x.r > 0 && (!best || x.w > best.w || (x.w === best.w && x.r > best.r))) best = x; });
  return best as { w: number; r: number } | null;
}
/** Days on or after `sinceDate` whose top set beat the exercise's best from earlier days, newest first; at most one per
 *  exercise a day (two logs on one day count as their best set). Check-offs are left out: they copy the plan, not what was
 *  lifted. A first day is not a best (there is nothing to beat). */
export function personalBests(logs: Logs, sinceDate: string): PersonalBest[] {
  const out: PersonalBest[] = [];
  const beats = (t: { w: number; r: number }, b: { w: number; r: number }) => t.w > b.w || (t.w === b.w && t.r > b.r);
  Object.entries(logs).forEach(([id, L]) => {
    const byDay: Record<string, { w: number; r: number }> = {};
    L.forEach(e => { if (e.auto) return; const t = topSet(e); if (t && (!byDay[e.d] || beats(t, byDay[e.d]))) byDay[e.d] = t; });
    let best: { w: number; r: number; d: string } | null = null;
    Object.keys(byDay).sort().forEach(d => {
      const t = byDay[d];
      if (best && beats(t, best) && d >= sinceDate) out.push({ id, d, w: t.w, r: t.r, prev: best });
      if (!best || beats(t, best)) best = { ...t, d };
    });
  });
  return out.sort((a, b) => b.d.localeCompare(a.d) || a.id.localeCompare(b.id));
}
