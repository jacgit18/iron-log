import { PHASES, PH_KEYS, exInfo, DAY_COUNT, slotsFor } from './data.js';
import { nowStamp } from '../shared/validate.js';
import { weekStartOf, ymd, parseDate, addDays } from '../shared/dates.js';
import { normExperimentItem } from '../shared/listItems.js';
import { isOrder, normWeek } from '../shared/week.js';
import type { Cfg, CardItem, Experiment, FlatSlot, LogEntry, LogSet, Logs, PhaseKey, ProgKey, Program, Week } from '../types.ts';

export { isOrder, normWeek };

/* Functions that read a week accept a partial one (a stored week may lack keys, and `rest` was once a single number). */
type WeekIn = Partial<Omit<Week, 'rest'>> & { rest?: number | number[] };
type Slot = FlatSlot;
type Cols = Record<number, Slot[]>;

/* ---------- Config defaults ---------- */
export const DEFAULT_CFG: Cfg = { muscleMap: {}, ex: {}, mode: 1, m3Start: 1, m3First: 'A', m2Even: 'A', pct: { strength: 85, iso: 75, hyp: 65, exp: 45 }, rxOverride: {}, rm: {}, phDef: {}, exPh: {} };

/* ---------- Program rotation ---------- */
export function programFor(cfg: Cfg, date: Date): ProgKey {
  const m = date.getMonth() + 1; // 1..12
  if (cfg.mode === 2) { const even = m % 2 === 0; const evenProg = cfg.m2Even || 'A'; return even ? evenProg : (evenProg === 'A' ? 'B' : 'A'); }
  if (cfg.mode === 3) { const idx = Math.floor((((m - cfg.m3Start) % 12) + 12) % 12 / 6); return idx === 0 ? cfg.m3First : (cfg.m3First === 'A' ? 'B' : 'A'); }
  return 'A';
}
export const progName = (cfg: Cfg, k: string) => (cfg.progNames && cfg.progNames[k]) || `Program ${k}`;
export function activeProgKey(cfg: Cfg, week: WeekIn, weekStart: Date): ProgKey { return (cfg.mode === 2 && (week.prog === 'A' || week.prog === 'B')) ? week.prog : programFor(cfg, weekStart); }

/* ---------- Small helpers ---------- */
// Phases whose sets are held for time (seconds) rather than counted in reps.
export const isTimed = (ph: PhaseKey | null | undefined) => ph === 'iso' || ph === 'mob';
export const round = (w: number) => w < 50 ? Math.round(w / 2.5) * 2.5 : Math.round(w / 5) * 5;
export const itemKey = (slot: { id: string }, idx: number) => `${slot.id}:${idx}`;
// A phase picked for one week beats the slot's saved default, which beats the exercise's default (all its cards), which beats the program's.
export const defaultPhase = (cfg: Cfg, slot: { id: string; items: CardItem[] }, idx: number): PhaseKey | null => cfg.phDef[itemKey(slot, idx)] ?? (cfg.exPh && cfg.exPh[slot.items[idx].ex]) ?? slot.items[idx].ph ?? null;
export function phaseOf(cfg: Cfg, week: WeekIn, slot: { id: string; items: CardItem[] }, idx: number): PhaseKey | null { return (week.ph || {})[itemKey(slot, idx)] ?? defaultPhase(cfg, slot, idx); }
export function rxOf(cfg: Cfg, item: Partial<CardItem>, ph: PhaseKey | null | undefined): string { if (item.rx && ph === item.ph) return item.rx; if (ph) return cfg.rxOverride[ph] || PHASES[ph].rx; return item.rx || ''; }

// Sessions you logged yourself for a lift in one phase, one per day, oldest first.
// Check-offs log the target, so counting them would raise the suggested weight on check-offs alone
// and call a lift stalled that you never logged.
function sessionsOf(logs: Logs, exId: string, ph: PhaseKey | null | undefined): LogEntry[] {
  const byDay: Record<string, LogEntry> = {}; (logs[exId] || []).filter(e => !e.auto && (e.ph || null) === (ph || null)).forEach(e => { byDay[e.d] = e; });
  return Object.keys(byDay).sort().map(d => byDay[d]);
}
const workOf = (e: LogEntry) => setsOfEntry(e).reduce((a, x) => a + (Number(x.sec ?? x.r) || 0), 0); // total reps (or hold seconds)
const step = (w: number) => (w < 50 ? 2.5 : 5);

// Stall: a lift is judged on its best session of each week (heaviest, then most reps), so lighter back-off days
// in a week trained 2–3 times don't count against it. Stalled when the last 3 training weeks never went above the
// first of them in weight and the latest didn't beat the first on total reps (or hold time). Explosive work
// progresses on speed rather than load and Mobility has no load, so neither is flagged. Not flagged when the app is
// already suggesting a heavier weight.
export function stallOf(cfg: Cfg, logs: Logs, exId: string, ph: PhaseKey | null | undefined) {
  if (ph === 'exp' || ph === 'mob') return null;
  const best: Record<string, LogEntry> = {};
  sessionsOf(logs, exId, ph).forEach(e => {
    const wk = e.wk || ymd(weekStartOf(parseDate(e.d))); const b = best[wk];
    if (!b || Number(e.w) > Number(b.w) || (Number(e.w) === Number(b.w) && workOf(e) > workOf(b))) best[wk] = e;
  });
  const L = Object.keys(best).sort().map(k => best[k]).slice(-3);
  if (L.length < 3 || L.some(e => !(Number(e.w) > 0))) return null;
  const w0 = Number(L[0].w); if (L.some(e => Number(e.w) > w0)) return null;
  if (Number(L[2].w) === w0 && workOf(L[2]) > workOf(L[0])) return null; // same weight but more reps: still progressing
  if (progressionOf(cfg, logs, { ex: exId }, ph)) return null;
  return { w: Number(L[2].w), since: L[0].d, n: 3 };
}

// Back off: the last two sessions in a row fell well short of the prescription.
// Strength: a set 2 or more reps under the target (4 or fewer on a 4 × 6); drop 5–10% and rebuild.
// Isometric: a hold shorter than the bottom of the range (under 15 s on 15–30 s); drop one weight step.
// Other phases have no back-off rule. Shown instead of a stall.
export function backoffOf(cfg: Cfg, logs: Logs, item: Pick<CardItem, 'ex'> & Partial<CardItem>, ph: PhaseKey | null | undefined) {
  if (ph !== 'strength' && ph !== 'iso') return null;
  const m = rxOf(cfg, item, ph).match(/(\d+)\s*×\s*(\d+)/); if (!m) return null;
  const target = Number(m[2]);
  const L = sessionsOf(logs, item.ex, ph).slice(-2);
  if (L.length < 2 || L.some(e => !(Number(e.w) > 0))) return null;
  const short = (e: LogEntry) => setsOfEntry(e).some(x => (ph === 'iso' ? x.sec != null && Number(x.sec) < target : x.r != null && Number(x.r) <= target - 2));
  if (!L.every(short)) return null;
  const w = Number(L[1].w);
  if (w - step(w) <= 0) return null; // already the lightest step
  if (ph === 'iso') return { w, lo: w - step(w), hi: w - step(w), since: L[0].d };
  const hi = Math.min(round(w * 0.95), w - step(w));
  return { w, lo: Math.min(round(w * 0.9), hi), hi, since: L[0].d };
}
export function progressionOf(cfg: Cfg, logs: Logs, item: Pick<CardItem, 'ex'> & Partial<CardItem>, ph: PhaseKey | null | undefined) {
  const L = sessionsOf(logs, item.ex, ph);
  if (L.length < 2) return null;
  const [a, b] = L.slice(-2); const w = Number(b.w);
  if (!(w > 0) || !(Number(a.w) >= w)) return null;
  const m = rxOf(cfg, item, ph).match(/(\d+)\s*×\s*(\d+)/); if (!m) return null;
  const sets = Number(m[1]), reps = Number(m[2]);
  const full = (e: LogEntry) => setsOfEntry(e).filter(x => Number(x.w) >= w && (isTimed(ph) ? Number(x.sec) >= 30 : Number(x.r) >= reps)).length >= sets;
  if (!full(a) || !full(b)) return null;
  return { w: w + (w < 50 ? 2.5 : 5), from: w };
}
export function targetOf(cfg: Cfg, logs: Logs, item: CardItem, ph: PhaseKey | null | undefined): { w: number | null; src: string; up?: true } {
  const base = baseTargetOf(cfg, logs, item, ph); const up = progressionOf(cfg, logs, item, ph);
  if (up && (base.w == null || up.w > base.w)) return { w: up.w, src: `up from ${up.from} lb`, up: true };
  return base;
}
// The starting weight: the weight last logged for this exercise in this phase (on any card), else the program's weight.
// A 1RM is kept for reference but does not set targets.
export function baseTargetOf(cfg: Cfg, logs: Logs, item: CardItem, ph: PhaseKey | null | undefined): { w: number | null; src: string } {
  const last = lastLog(logs, item.ex, ph);
  if (last && last.w != null && (last.w as unknown) !== '' && Number(last.w) > 0) return { w: Number(last.w), src: 'last session' };
  if (item.w != null) return { w: item.w, src: 'program' };
  if (item.bw) return { w: null, src: 'bodyweight' };
  return { w: null, src: '' };
}
export const lastLog = (logs: Logs, exId: string, ph?: PhaseKey | null) => { const l = (logs[exId] || []).filter(e => ph === undefined || (e.ph || null) === (ph || null)); return l.length ? l[l.length - 1] : null; };

// One lift can run in several phases (Chest Press: Strength on one day, Hypertrophy on another), so the
// 1RM table lists weights per phase: [{ph, w}], in phase order, "no phase" last.
const phaseOrder = (ph: PhaseKey | null) => (ph ? PH_KEYS.indexOf(ph) : PH_KEYS.length);
const byPhase = (a: { ph: PhaseKey | null; w: number }, b: { ph: PhaseKey | null; w: number }) => phaseOrder(a.ph) - phaseOrder(b.ph) || a.w - b.w;
export function programWeights(cfg: Cfg, slots: Slot[], exId: string) {
  const out: { ph: PhaseKey | null; w: number }[] = [];
  slots.forEach(s => s.items.forEach((it, i) => {
    if (it.ex !== exId || it.w == null) return;
    const ph = defaultPhase(cfg, s, i);
    if (!out.some(x => x.ph === ph && x.w === it.w)) out.push({ ph, w: it.w });
  }));
  return out.sort(byPhase);
}
export function bestByPhase(entries: LogEntry[] | null | undefined) {
  const best: Record<string, number> = {};
  (entries || []).forEach(e => { const w = Number(e.w); const ph = e.ph || null; if (w > 0 && !(best[String(ph)] >= w)) best[String(ph)] = w; });
  return Object.keys(best).map(k => ({ ph: (k === 'null' ? null : k) as PhaseKey | null, w: best[k] })).sort(byPhase);
}

/* ---------- Per-set logging ----------
   An entry keeps each set in e.sets: [{w, r}] (or [{w, sec}] for holds). It also keeps summary fields that
   the rest of the app reads: w = heaviest weight, s = number of sets, r / sec = the lowest reps / hold,
   so "every set hit the target" is simply r >= target. Older entries have only the summary fields. */
export function summarizeSets(sets: LogSet[], iso?: boolean) {
  const ws = sets.map(x => x.w).filter((v): v is number => v != null);
  const out: { w: number | null; s: number; r?: number; sec?: number; sets?: LogSet[] } = { w: ws.length ? Math.max(...ws) : null, s: sets.length };
  const vals = sets.map(x => iso ? x.sec : x.r).filter((v): v is number => v != null);
  if (vals.length) out[iso ? 'sec' : 'r'] = Math.min(...vals);
  out.sets = sets; return out;
}
export function setsOfEntry(e: LogEntry): LogSet[] {
  if (Array.isArray(e.sets) && e.sets.length) return e.sets;
  const n = Number(e.s) || 0; const w = ((e.w as unknown) === '' || e.w == null) ? null : Number(e.w);
  return Array.from({ length: n }, () => e.sec != null ? { w, sec: Number(e.sec) } : { w, r: e.r == null ? null : Number(e.r) });
}
export const setVal = (x: LogSet) => x.sec != null ? `${x.sec}s` : (x.r ?? '?');
export const isUniform = (e: LogEntry) => { const S = e.sets; return !S || S.length < 2 || S.every(x => x.w === S[0].w && x.r === S[0].r && x.sec === S[0].sec); };
export function volText(e: LogEntry): string {
  if (isUniform(e)) return e.sec ? `${e.s || '?'} × ${e.sec}s` : `${e.s || '?'} × ${e.r || '?'}`;
  const S = e.sets!; if (S.every(x => x.w === S[0].w)) return S.map(setVal).join(', ');
  const groups: { w: number | null | undefined; v: (string | number)[] }[] = []; S.forEach(x => { const g = groups[groups.length - 1]; if (g && g.w === x.w) g.v.push(setVal(x)); else groups.push({ w: x.w, v: [setVal(x)] }); });
  return groups.map(g => `${g.w != null ? g.w + ' lb' : 'bodyweight'} × ${g.v.join(', ')}`).join(' · ');
}
export function describe(e: LogEntry | null | undefined): string {
  if (!e) return '';
  const S = e.sets!; if (!isUniform(e) && !S.every(x => x.w === S[0].w)) return volText(e);
  const load = e.w != null && (e.w as unknown) !== '' ? `${e.w} lb` : 'bodyweight'; return `${load} · ${volText(e)}`;
}

/* ---------- What counts: the one rule every count in the app uses ---------- */
export const isSkipped = (s: { id: string }, w: WeekIn) => !!(w.skipped && w.skipped[s.id]);
// Done state lives in week.done: done[id] = the whole card is done; done[`${id}#${i}`] = one exercise
// in a paired card (a superset half, or the either/or option that was picked).
export const itemKey2 = (s: { id: string }, i: number) => `${s.id}#${i}`;
export const isPaired = (s: { type: Slot['type'] }) => s.type === 'superset' || s.type === 'either';
type Card = { id: string; type: Slot['type']; items: unknown[] };
export function isItemDone(s: Card, i: number, w: WeekIn): boolean {
  const d = w.done || {};
  if (!isPaired(s)) return !!d[s.id];
  if (d[itemKey2(s, i)]) return true;
  if (!d[s.id]) return false;
  if (s.type === 'superset') return true;
  return i === 0 && !s.items.some((_, j) => d[itemKey2(s, j)]); // either/or done without a recorded pick: show the first
}
export function isDone(s: Card, w: WeekIn): boolean {
  const d = w.done || {}; if (d[s.id]) return true;
  if (s.type === 'superset') return s.items.every((_, i) => d[itemKey2(s, i)]);
  if (s.type === 'either') return s.items.some((_, i) => d[itemKey2(s, i)]);
  return false;
}
export const isOpen = (s: Card, w: WeekIn) => !isDone(s, w) && !isSkipped(s, w); // still to do this week
// How many units a card adds to a total, and how many of those are done:
// a superset counts each exercise, an either/or counts once, a single card counts once.
export const unitsOf = (s: Card) => s.type === 'superset' ? s.items.length : 1;
export const doneUnitsOf = (s: Card, w: WeekIn) => s.type === 'superset' ? s.items.filter((_, i) => isItemDone(s, i, w)).length : (isDone(s, w) ? 1 : 0);

export function clearDone(week: WeekIn, s: Card) { if (!week.done) return; const done = week.done; delete done[s.id]; s.items.forEach((_, i) => delete done[itemKey2(s, i)]); }
// Skipping a card clears its done marks, except the exercises already ticked in a half-done superset: those stay done.
export function clearForSkip(week: WeekIn, s: Card) { if (s.type === 'superset' && !(week.done && week.done[s.id])) return; clearDone(week, s); }
export function setCardDone(week: Week, s: Card, on: boolean) { clearDone(week, s); if (on) { week.done[s.id] = true; if (week.skipped) delete week.skipped[s.id]; } }
export function setItemDone(week: Week, s: Card, idx: number, on: boolean): void {
  if (!isPaired(s)) return setCardDone(week, s, on);
  if (s.type === 'superset') {
    const cur = s.items.map((_, i) => isItemDone(s, i, week)); cur[idx] = on; clearDone(week, s);
    if (cur.every(Boolean)) week.done[s.id] = true; else cur.forEach((v, i) => { if (v) week.done[itemKey2(s, i)] = true; });
  } else { clearDone(week, s); if (on) { week.done[s.id] = true; week.done[itemKey2(s, idx)] = true; } }
  if (on && week.skipped) delete week.skipped[s.id];
}
// Totals for any list of cards. Skipped cards are left out of total and done.
export function tally(slots: Card[], w: WeekIn) {
  let total = 0, done = 0, skipped = 0;
  slots.forEach(s => { if (isSkipped(s, w)) { skipped++; if (s.type === 'superset') { const n = doneUnitsOf(s, w); total += n; done += n; } return; } total += unitsOf(s); done += doneUnitsOf(s, w); });
  return { total, done, skipped, full: total > 0 && done === total };
}
// A day is finished when its workout is: every card but Home and Optional ones (the sled) ticked or skipped, and at
// least one ticked. tally(...).full still needs every card; this is only what raises a back-to-back suggestion.
export const countsForFinish = (s: { sec?: string }) => s.sec !== 'Home' && s.sec !== 'Optional';
export function isFinished(slots: (Card & { sec?: string })[], w: WeekIn) {
  const xs = slots.filter(countsForFinish);
  return xs.length > 0 && xs.every(s => isSkipped(s, w) || doneUnitsOf(s, w) === unitsOf(s)) && xs.some(s => doneUnitsOf(s, w) > 0);
}
/* ---------- Days and the rest day ----------
   week.rest = [N, ...] lists the rest days (displayed columns, ascending). Workouts fill the other columns in
   order, so each rest day pushes later workouts one day later. The layout is derived, so nothing stored
   changes and unticking undoes it. A workout pushed past the last column is hidden, and only skipped ones may be. */
export const DAYS = Array.from({ length: DAY_COUNT }, (_, i) => i + 1);
export const restsOf = (w: WeekIn | null | undefined): number[] => (w && Array.isArray(w.rest) ? w.rest : typeof w?.rest === 'number' && Number.isInteger(w.rest) ? [w.rest] : []); // a single number is how older files stored it
export const shownDay = (rest: number[] | undefined, d: number) => { let c = d; for (const r of rest || []) if (r <= c) c++; return c; }; // may pass DAY_COUNT: off the board
export const programDay = (rest: number[] | undefined, d: number) => ((rest || []).includes(d) ? null : d - (rest || []).filter(r => r < d).length);
// week.order[i] = the program day shown at workout position i + 1 (absent = normal order).
export const orderOf = (w: WeekIn | null | undefined): number[] => (w && isOrder(w.order) ? w.order : DAYS);
export const posOf = (w: WeekIn | null | undefined, d: number) => { const i = orderOf(w).indexOf(d); return i >= 0 ? i + 1 : Math.min(Math.max(Math.round(d) || 1, 1), DAY_COUNT); }; // always 1..7, even for a stray value
export const colOf = (w: WeekIn | null | undefined, d: number) => shownDay(restsOf(w), posOf(w, d)); // displayed column of a program day
export const dayAt = (w: WeekIn | null | undefined, c: number): number | null => { const p = programDay(restsOf(w), c); return p == null ? null : orderOf(w)[p - 1]; }; // program day shown in column c; null on the rest column
export const dayTitle = (day: { title?: string }, d: number) => (!day.title || /^Day \d+$/.test(day.title) ? `Day ${d}` : day.title);
const colOfSlot = (week: WeekIn, s: Slot) => colOf(week, (week.moved && week.moved[s.id]) || s.day);
// Cards that a rest day on column n would push off the board (on top of the week's current rest days).
export const overflowSlots = (week: WeekIn, slots: Slot[], n = 1) => {
  const rest = [...new Set([...restsOf(week), n])].sort((a, b) => a - b);
  return slots.filter(s => shownDay(rest, posOf(week, (week.moved && week.moved[s.id]) || s.day)) > DAY_COUNT);
};
// A rest day would push a workout off the board (skipped ones may go; they come back when the rest day is unticked).
export const restBlocked = (week: WeekIn, slots: Slot[], n: number) => overflowSlots(week, slots, n).some(s => !isSkipped(s, week));
export function currentLayout(week: WeekIn, slots: Slot[]): Cols {
  const cols: Cols = Object.fromEntries(DAYS.map(d => [d, [] as Slot[]]));
  slots.forEach(s => { const c = colOfSlot(week, s); if (cols[c]) cols[c].push(s); });
  // A card moved here from another day sits at the top of the column; the rest keep program order.
  const isMoved = (s: Slot) => !!(week.moved && week.moved[s.id]);
  DAYS.forEach(c => { cols[c] = [...cols[c].filter(isMoved), ...cols[c].filter(s => !isMoved(s))]; });
  return cols;
}

/* ---------- Experiment cards (week.extra) ---------- */
// The Experiment list from a file or another device: valid entries, each id once.
export function normExperiments(list: unknown) {
  const seen = new Set<string>(); const out: Experiment[] = [];
  (Array.isArray(list) ? list : []).forEach(e => {
    const item = normExperimentItem(e);
    if (!item || seen.has(item.id)) return;
    seen.add(item.id); out.push(item);
  });
  return out;
}
export const extraSlots = (w: WeekIn): Slot[] => (w.extra || []).map(x => ({ id: x.id, day: x.day, type: 'single', sec: x.add ? 'Added' : 'Experiment', experiment: true, ...(x.add ? { added: true } : {}), items: [{ ex: x.ex, ph: x.ph }], ...(x.note ? { note: x.note } : {}) }));
// The week's cards: the program's, then the experiment cards added to this week.
export const weekSlots = (prog: Program, w: WeekIn) => [...slotsFor(prog), ...extraSlots(normWeek(w))];

// Same exercise already on the target day, the day before, or the day after (skipped cards don't count).
// Back-to-back follows the planner's rule: Home and either/or cards never clash, and neither does an exercise on
// every other workout day (the sled). The same exercise twice on one day always warns.
export function moveClashes(cfg: Cfg, week: WeekIn, slots: Slot[], s: Slot, day: number): string[] {
  const cols = currentLayout(week, slots); const out: string[] = [];
  const daily = dailyOf(currentLayout(week, slots.filter(o => o.id !== s.id)), week);
  ([[day, 'the same day'], [day + 1, 'the day after'], [day - 1, 'the day before']] as [number, string][]).forEach(([d, rel]) => {
    const near = d !== day;
    if (!cols[d] || (near && !countsForClash(s))) return;
    cols[d].forEach(o => {
      if (o.id === s.id || isSkipped(o, week) || (near && !countsForClash(o))) return;
      s.items.forEach((it, i) => {
        if (near && daily.has(it.ex)) return;
        o.items.forEach((ot, j) => {
          if (ot.ex !== it.ex) return;
          const p = phaseOf(cfg, week, o, j), q = phaseOf(cfg, week, s, i);
          const ph = p ? ` (${PHASES[p].label}${q && q !== p ? ` there, ${PHASES[q].label} here` : ''})` : '';
          const name = exInfo(cfg, it.ex).n;
          out.push(d === day ? `${name} is already on Day ${d}${ph}, so you'd train it twice that day.` : `${name} is also on Day ${d}${ph}, ${rel}, so you'd train it on back-to-back days.`);
        });
      });
    });
  });
  return [...new Set(out)];
}

// Nearest column to `day` where the card wouldn't clash, skipping the rest day and `from`; a tie goes to the later day.
export function altDay(cfg: Cfg, week: WeekIn, slots: Slot[], s: Slot, day: number, from: number): number | null {
  for (let k = 1; k < DAY_COUNT; k++) for (const c of [day + k, day - k]) {
    if (c < 1 || c > DAY_COUNT || c === from || dayAt(week, c) == null) continue;
    if (!moveClashes(cfg, week, slots, s, c).length) return c;
  }
  return null;
}

/* ---------- A new day order after a day is finished ----------
   A clash is the same exercise on two neighboring columns. An exercise on every workout day is left out:
   no order can split it, and so are Home cards (daily habits) and either/or cards (you pick whichever is free).
   planOrder only suggests; the store writes week.order and week.rest on Apply. */
export const countsForClash = (s: Slot) => s.sec !== 'Home' && s.type !== 'either';
const exOfCol = (list: Slot[], w: WeekIn, skip: Set<string>) => new Set(list.filter(s => !isSkipped(s, w) && countsForClash(s)).flatMap(s => s.items.map(it => it.ex)).filter(ex => !skip.has(ex)));
const dailyOf = (cols: Cols, w: WeekIn): Set<string> => {
  const days = DAYS.map(d => exOfCol(cols[d], w, new Set())).filter(x => x.size);
  return days.length < 2 ? new Set() : new Set([...days[0]].filter(ex => days.every(x => x.has(ex))));
};
const pairClash = (cols: Cols, w: WeekIn, skip: Set<string>, a: number, b: number) => { const x = exOfCol(cols[b] || [], w, skip); return [...exOfCol(cols[a] || [], w, skip)].filter(ex => x.has(ex)); };
const countFrom = (cols: Cols, w: WeekIn, skip: Set<string>, from: number) => DAYS.filter(c => c >= from && c < DAY_COUNT).reduce((n, c) => n + pairClash(cols, w, skip, c, c + 1).length, 0);
export const dailyExercises = (week: WeekIn, slots: Slot[]) => { const cols = currentLayout(week, slots); return [...dailyOf(cols, week)]; };
export const dayClash = (week: WeekIn, slots: Slot[], a: number, b: number) => { const cols = currentLayout(week, slots); return pairClash(cols, week, dailyOf(cols, week), a, b); };
export const clashCount = (week: WeekIn, slots: Slot[], from: number) => { const cols = currentLayout(week, slots); return countFrom(cols, week, dailyOf(cols, week), from); };

// Every distinct arrangement of `items` (repeats allowed), the given order first.
function arrangements<T>(items: T[]): T[][] {
  const out: T[][] = []; const used = items.map(() => false); const cur: T[] = [];
  (function go() {
    if (cur.length === items.length) { out.push([...cur]); return; }
    const tried = new Set<T>();
    items.forEach((it, i) => { if (used[i] || tried.has(it)) return; tried.add(it); used[i] = true; cur.push(it); go(); cur.pop(); used[i] = false; });
  })();
  return out;
}

// Columns after doneCol a suggestion may change: rest columns, and workout columns with cards and nothing checked.
// An empty day stays put: it is where a rest day goes, so moving it could leave a rest day no room on the board.
const movableCols = (week: WeekIn, cols: Cols, doneCol: number) => DAYS.filter(c => c > doneCol && (dayAt(week, c) == null || (cols[c].length > 0 && !cols[c].some(s => s.items.some((_, i) => isItemDone(s, i, week))))));
const listOf = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0]);
// What clashes now, one line per neighboring pair from the finished column on.
const clashLines = (cfg: Cfg, cols: Cols, week: WeekIn, skip: Set<string>, doneCol: number): string[] => DAYS.filter(c => c >= doneCol && c < DAY_COUNT).flatMap(c => {
  const shared = pairClash(cols, week, skip, c, c + 1); if (!shared.length) return [];
  return [`${listOf(shared.map(ex => exInfo(cfg, ex).n))} ${shared.length > 1 ? 'are' : 'is'} on Day ${c} and Day ${c + 1}.`];
});
const lexLess = (a: number[], b: number[]) => { const k = a.findIndex((v, i) => v !== b[i]); return k >= 0 && a[k] < b[k]; };
const outcomeOf = (before: number, after: number) => (after ? `leaves ${after} back-to-back repeat${after > 1 ? 's' : ''} instead of ${before}.` : 'fixes it.');

// After column doneCol is finished: the order of the later, unstarted columns (rest days included) with the fewest
// back-to-back repeats. Moving a rest day comes first: if that alone (workouts in the same order) cuts the repeats,
// it is the suggestion. Otherwise workouts may be reordered too. Ties go to the one that reorders the fewest
// workouts, then changes the fewest columns.
// Returns null unless it has fewer repeats than now; otherwise { order, rest, before, after, lines }.
type OrderPlan = { order: number[]; rest: number[]; before: number; after: number; lines: string[]; restOnly: boolean };
function searchOrder(cfg: Cfg, week: WeekIn, slots: Slot[], doneCol: number): OrderPlan | null {
  const cols = currentLayout(week, slots); const skip = dailyOf(cols, week);
  const rest = restsOf(week); const order = orderOf(week);
  const before = countFrom(cols, week, skip, doneCol);
  if (!before) return null;
  const R = 'R'; const items: (number | 'R')[] = DAYS.map(c => (rest.includes(c) ? R : dayAt(week, c) as number));
  // An empty day stays put: it is where a rest day goes, so moving it could leave a rest day no room on the board.
  const movable = movableCols(week, cols, doneCol);
  if (movable.length < 2) return null;
  const hidden = order.slice(DAY_COUNT - rest.length);
  const seq = items.filter((x): x is number => x !== R); const at = (d: number) => seq.indexOf(d);
  type Cand = { key: number[]; next: (number | 'R')[]; cand: Week };
  let best = null as Cand | null, bestRest = null as Cand | null;
  const better = (key: number[], b: Cand | null) => { const k = b ? key.findIndex((v, i) => v !== b.key[i]) : -1; return !b || (k >= 0 && key[k] < b.key[k]); };
  for (const arr of arrangements(movable.map(c => items[c - 1]))) {
    const next = [...items]; movable.forEach((c, i) => { next[c - 1] = arr[i]; });
    const cand: Week = { ...({ prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} } as Week), ...week, rest: DAYS.filter(c => next[c - 1] === R), order: [...next.filter((x): x is number => x !== R), ...hidden] };
    const ws = next.filter(x => x !== R); let inv = 0;
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) if (at(ws[i]) > at(ws[j])) inv++;
    const key = [countFrom(currentLayout(cand, slots), cand, skip, doneCol), inv, next.filter((x, i) => x !== items[i]).length];
    if (better(key, best)) best = { key, next, cand };
    if (inv === 0 && better(key, bestRest)) bestRest = { key, next, cand };
  }
  if (!best) return null;
  const restOnly = !!(bestRest && bestRest.key[0] < before);
  if (restOnly) best = bestRest as Cand;
  const after = best.key[0];
  if (after >= before) return null;
  // Words: what clashes now, and what the new order changes.
  const lines = clashLines(cfg, cols, week, skip, doneCol);
  const changed = DAYS.filter(c => best.next[c - 1] !== items[c - 1]);
  const empty = (x: number) => !cols[colOf(week, x)].length;
  const label = (x: number | 'R') => (x === R ? 'Rest' : empty(x) ? 'empty day' : `Day ${colOf(week, x)}'s workout`);
  const the = (x: number | 'R') => (x === R ? 'your rest day' : empty(x) ? 'the empty day' : `Day ${colOf(week, x)}'s workout`);
  // Say it plainly when it is one swap of two workouts, or one day moved with the ones between shifting along.
  let what = changed.length === 2 && !changed.some(c => items[c - 1] === R || best.next[c - 1] === R) ? `Swapping Day ${changed[0]} and Day ${changed[1]}` : null;
  const from = [...DAYS.filter(c => items[c - 1] === R), ...DAYS.filter(c => items[c - 1] !== R)].map(c => c - 1); // a rest day first
  for (const p of from) for (let q = 0; !what && q < DAY_COUNT; q++) {
    const m = [...items]; const [x] = m.splice(p, 1); m.splice(q, 0, x);
    if (p !== q && m.every((v, i) => v === best.next[i])) what = `Moving ${the(x)} from Day ${p + 1} to Day ${q + 1}`;
  }
  const outcome = outcomeOf(before, after);
  const first = changed[0], last = changed[changed.length - 1];
  lines.push(what ? `${what} ${outcome}` : `New order for Days ${first} to ${last}: ${DAYS.filter(c => c >= first && c <= last).map(c => label(best.next[c - 1])).join(', ')}. That ${outcome}`);
  return { order: best.cand.order!, rest: best.cand.rest!, before, after, lines, restOnly };
}
export function planOrder(cfg: Cfg, week: WeekIn, slots: Slot[], doneCol: number) {
  const plan = searchOrder(cfg, week, slots, doneCol); if (!plan) return null;
  const { restOnly: _restOnly, ...out } = plan; // eslint-disable-line no-unused-vars
  return out;
}


// After column doneCol is finished: the one card move with the fewest back-to-back repeats. The card sits in a
// movable workout column and counts for clashes; it goes to another movable workout column that doesn't already have
// one of its exercises. The day it leaves keeps a card that counts toward finishing, and the move must not change
// which exercises are on every workout day (that would hide a repeat rather than fix it).
// Ties go to the target nearest the card, then the later day, then the first card on the board.
// Returns null unless it has fewer repeats than now; otherwise { slot, from, to, pd, before, after, lines }.
export function planCard(cfg: Cfg, week: WeekIn, slots: Slot[], doneCol: number) {
  const cols = currentLayout(week, slots); const skip = dailyOf(cols, week);
  const before = countFrom(cols, week, skip, doneCol);
  if (!before) return null;
  const open = movableCols(week, cols, doneCol).filter(c => dayAt(week, c) != null);
  const exs = (list: Slot[]) => new Set(list.filter(o => !isSkipped(o, week) && countsForClash(o)).flatMap(o => o.items.map(it => it.ex)));
  const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x));
  let best = null as { key: number[]; s: Slot; from: number; to: number } | null;
  open.forEach(from => cols[from].forEach(s => {
    if (!countsForClash(s) || isSkipped(s, week)) return;
    if (!cols[from].some(o => o !== s && countsForFinish(o))) return;
    open.forEach(to => {
      if (to === from) return;
      const there = exs(cols[to]); if (s.items.some(it => there.has(it.ex))) return;
      const next = { ...cols, [from]: cols[from].filter(o => o !== s), [to]: [...cols[to], s] };
      if (!sameSet(dailyOf(next, week), skip)) return;
      const key = [countFrom(next, week, skip, doneCol), Math.abs(to - from), -to];
      if (!best || lexLess(key, best.key)) best = { key, s, from, to };
    });
  }));
  if (!best || best.key[0] >= before) return null;
  const { s, from, to } = best; const after = best.key[0];
  const names = s.items.map(it => exInfo(cfg, it.ex).n);
  const what = s.type === 'superset' ? `the ${names.join(' + ')} superset` : names[0];
  const lines = [...clashLines(cfg, cols, week, skip, doneCol), `Moving ${what} from Day ${from} to Day ${to} ${outcomeOf(before, after)}`];
  return { slot: s.id, from, to, pd: dayAt(week, to), before, after, lines };
}

// What to suggest when a day is finished, smallest change first: moving the rest day (if that alone cuts the
// repeats), then one card, then a new day order, which wins only when it leaves fewer repeats than the card move.
// Returns null, { kind: 'order', order, rest, before, after, lines } or { kind: 'card', slot, from, to, pd, before, after, lines }.
export function planFix(cfg: Cfg, week: WeekIn, slots: Slot[], doneCol: number) {
  const order = searchOrder(cfg, week, slots, doneCol);
  const asOrder = () => { const { restOnly: _restOnly, ...o } = order!; return { kind: 'order' as const, ...o }; }; // eslint-disable-line no-unused-vars
  if (order && order.restOnly) return asOrder();
  const card = planCard(cfg, week, slots, doneCol);
  if (card && (!order || card.after <= order.after)) return { kind: 'card', ...card };
  return order ? asOrder() : null;
}

/* ---------- Yesterday's leftovers ---------- */
export const todayCol = (date: Date) => date.getDay() + 1; // the week runs Sunday (column 1) to Saturday (column 7)
// Cards in column c with nothing checked that aren't skipped; none on the rest column.
export const leftovers = (week: WeekIn, slots: Slot[], c: number): Slot[] => (dayAt(week, c) == null ? [] : currentLayout(week, slots)[c].filter(s => !isSkipped(s, week) && !s.items.some((_, i) => isItemDone(s, i, week))));
// Later columns a batch can move to: not the rest day and not already finished.
export function moveTargets(week: WeekIn, slots: Slot[], c: number) { const cols = currentLayout(week, slots); return DAYS.filter(d => d > c && dayAt(week, d) != null && !tally(cols[d], week).full); }

export function holdPlan(cfg: Cfg, week: WeekIn, logs: Logs, slot: Slot, idx: number) {
  const it = slot.items[idx]; const ph = phaseOf(cfg, week, slot, idx); const rx = rxOf(cfg, it, ph);
  const m = rx.match(/(\d+)\s*×\s*(\d+)(?:\s*[–-]\s*(\d+))?/); const sets = m ? Number(m[1]) : 4;
  const last = lastLog(logs, it.ex, ph); const hold = (last && last.sec) ? Number(last.sec) : (m ? Number(m[2]) : 30);
  return { sets, hold };
}

// Starting set rows for the log sheet: the prescription's set count, prefilled with the target.
export function planRows(cfg: Cfg, logs: Logs, it: CardItem, ph: PhaseKey | null | undefined): LogSet[] {
  const iso = isTimed(ph); const m = rxOf(cfg, it, ph).match(/(\d+)\s*×\s*(\d+)/); const n = m ? Number(m[1]) : 3; const t = targetOf(cfg, logs, it, ph);
  const reps = m ? Number(m[2]) : null; const hold = iso ? ((lastLog(logs, it.ex, ph) || {}).sec || reps) : null;
  return Array.from({ length: n }, () => iso ? { w: t.w ?? null, sec: hold } : { w: t.w ?? null, r: reps });
}

/* ---------- Check-offs log the plan ----------
   Checking an exercise off without logging it records the target shown on its card (marked auto), so it
   shows in Progress. Unchecking removes that entry, and logging real numbers for the slot that week
   replaces it. Returns only the exercises whose entries changed: {exId: entries}. */
export const AUTO_NOTE = 'From check-off';
const weekOfEntry = (e: LogEntry) => e.wk || ymd(weekStartOf(parseDate(e.d)));
// The day a board was worked: the earliest date among this week's log entries for the cards in it.
export function dayDate(cards: Slot[], logs: Logs, wk: string): string | null {
  let first: string | null = null;
  cards.forEach(s => s.items.forEach(it => (logs[it.ex] || []).forEach(e => { if (e.slot === s.id && e.d && weekOfEntry(e) === wk && (!first || e.d < first)) first = e.d; })));
  return first;
}
// removeLogged: unticking also removes what you logged yourself for the card this week (the checkboxes do; skipping doesn't).
export const newEntryId = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// The planned numbers a check-off logs for item i of card s.
export function autoEntry(cfg: Cfg, logs: Logs, s: Slot, i: number, week: WeekIn, wk: string, date: string): LogEntry {
  const it = s.items[i]; const ph = phaseOf(cfg, week, s, i);
  return { id: newEntryId(), d: date, ph, ...summarizeSets(planRows(cfg, logs, it, ph), isTimed(ph)), slot: s.id, wk, auto: true, updatedAt: nowStamp() };
}
export function autoLogs(cfg: Cfg, logs: Logs, slots: Slot[], before: WeekIn, after: WeekIn, wk: string, date: string, { removeLogged = false } = {}): Logs {
  const out: Logs = {};
  slots.forEach(s => {
    const here = (e: LogEntry) => e.slot === s.id && weekOfEntry(e) === wk;
    let unticked = false;
    s.items.forEach((it, i) => {
      const was = isItemDone(s, i, before), now = isItemDone(s, i, after);
      if (was === now) return;
      const L = out[it.ex] || logs[it.ex] || [];
      if (now) {
        if (L.some(here)) return; // already logged for this card this week
        out[it.ex] = [...L, autoEntry(cfg, logs, s, i, after, wk, date)].sort((a, b) => a.d.localeCompare(b.d));
      } else {
        unticked = true;
        const keep = L.filter(e => !((removeLogged || e.auto) && here(e)));
        if (keep.length !== L.length) out[it.ex] = keep;
      }
    });
    // A check-off logged under an exercise the card no longer has (it was changed in the Program tab) goes too.
    if (!unticked) return;
    const mine = new Set(s.items.map(it => it.ex));
    Object.keys(logs).forEach(ex => {
      if (mine.has(ex)) return;
      const L = out[ex] || logs[ex] || []; const keep = L.filter(e => !(e.auto && here(e)));
      if (keep.length !== L.length) out[ex] = keep;
    });
  });
  return out;
}

// Today when viewing the current week (or the day after it ends), otherwise the viewed week's Sunday.
// Compared as dates, not instants, so the whole of that next day counts.
export function defaultLogDate(weekStart: Date) { const today = ymd(new Date()); return (today >= ymd(weekStart) && today <= ymd(addDays(weekStart, 7))) ? today : ymd(weekStart); }

