import { describe, it, expect } from 'vitest';
import type { FlatSlot, Logs, PhaseKey, Week } from '../types.ts';
import { BUILTIN, PH_KEYS, slotsFor } from './data.js';
import {
  DEFAULT_CFG, normWeek, isDone, isSkipped, isPaired, isItemDone, colOf, restsOf, phaseOf, targetOf, lastLog, rxOf, stallOf, backoffOf, holdPlan,
  itemKey, itemKey2,
} from './logic.js';
import { cardWeek, cardLogs } from './cardView.js';

const cfg = structuredClone(DEFAULT_CFG);
const extra: FlatSlot[] = [
  { id: 'ss', day: 2, type: 'superset', items: [{ ex: 'hipthrust', ph: 'strength' }, { ex: 'chestpress', ph: 'hyp' }] } as FlatSlot,
  { id: 'eo', day: 3, type: 'either', items: [{ ex: 'farmers', ph: 'strength' }, { ex: 'dblunge', ph: 'iso' }] } as FlatSlot,
];
const slots: FlatSlot[] = [...slotsFor(BUILTIN.A), ...slotsFor(BUILTIN.B), ...extra];
const phases: PhaseKey[] = [...PH_KEYS];

// A busy week: every third card done, some skipped, some moved, phase picks, two rest days and a changed day order.
function busyWeek(): Week {
  const w = normWeek(null);
  slots.forEach((s, n) => {
    if (n % 3 === 0) w.done[s.id] = true;
    if (n % 5 === 1) w.skipped[s.id] = true;
    if (n % 4 === 2) w.moved[s.id] = (n % 7) + 1;
    s.items.forEach((_, i) => { if ((n + i) % 2) w.ph[itemKey(s, i)] = phases[(n + i) % phases.length]; });
  });
  w.done[itemKey2(extra[0], 1)] = true; w.done[itemKey2(extra[1], 1)] = true;
  w.rest = [3, 6]; w.order = [2, 1, 3, 4, 5, 6, 7];
  return w;
}
// Logs for every exercise, in every phase, in one of three patterns: two full sessions (a raised target), two sessions
// well short (back off), three weeks at the same weight and reps (stalled); plus an auto entry, which these rules skip.
function busyLogs(): Logs {
  const logs: Logs = {};
  const sets = { full: { r: 20, sec: 60 }, short: { r: 1, sec: 1 }, flat: { r: 3, sec: 20 } };
  [...new Set(slots.flatMap(s => s.items.map(it => it.ex)))].forEach((ex, n) => {
    const kind = (['full', 'short', 'flat'] as const)[n % 3]; const w = 100;
    logs[ex] = ['2026-09-01', '2026-09-08', '2026-09-15'].flatMap(d => phases.map(ph => {
      const isTimed = ph === 'iso';
      return { d, ph, w, sets: Array.from({ length: 6 }, () => (isTimed ? { w, sec: sets[kind].sec } : { w, r: sets[kind].r })) };
    }));
    logs[ex].push({ d: '2026-09-23', ph: phases[n % phases.length], w: 60, s: 3, r: 8, auto: true });
  });
  return logs;
}

// What Card draws for a card, from whichever week and logs it is given.
const view = (week: Partial<Week>, logs: Logs, s: FlatSlot) => ({
  done: isDone(s, week), skipped: isSkipped(s, week), cur: colOf(week, week.moved?.[s.id] || s.day), planned: colOf(week, s.day),
  moved: !!week.moved?.[s.id], rests: restsOf(week),
  items: s.items.map((it, idx) => {
    const ph = phaseOf(cfg, week, s, idx);
    return {
      ph, t: targetOf(cfg, logs, it, ph), last: lastLog(logs, it.ex, ph), idone: isPaired(s) && isItemDone(s, idx, week), rx: rxOf(cfg, it, ph),
      bo: backoffOf(cfg, logs, it, ph), st: stallOf(cfg, logs, it.ex, ph), hp: holdPlan(cfg, week, logs, s, idx),
    };
  }),
});

describe('cardWeek and cardLogs', () => {
  it('give every card the same view as the whole week and all logs', () => {
    const week = busyWeek(), logs = busyLogs();
    expect(slots.length).toBeGreaterThan(40);
    for (const s of slots) expect(view(cardWeek(week, s), cardLogs(logs, s), s)).toEqual(view(week, logs, s));
    // the fixture reaches every branch Card shows: last session, a raised target, back off, stalled, a hold, done, skipped, moved
    const all = slots.map(s => view(week, logs, s)); const items = all.flatMap(v => v.items);
    expect({
      last: items.some(i => i.last), up: items.some(i => i.t.up), bo: items.some(i => i.bo), st: items.some(i => i.st), idone: items.some(i => i.idone),
      done: all.some(v => v.done), skipped: all.some(v => v.skipped), moved: all.some(v => v.moved && v.cur !== v.planned),
    }).toEqual({ last: true, up: true, bo: true, st: true, idone: true, done: true, skipped: true, moved: true });
  });
  it('the same for an empty week and no logs', () => {
    const week = normWeek(null);
    for (const s of slots) expect(view(cardWeek(week, s), cardLogs({}, s), s)).toEqual(view(week, {}, s));
  });
  it("leave out other cards' keys, so ticking one card does not change another card's slice", () => {
    const week = busyWeek(); const [a, b] = slots;
    const before = JSON.stringify(cardWeek(week, b));
    if (week.done[a.id]) delete week.done[a.id]; else week.done[a.id] = true; week.skipped[a.id] = true; week.ph[itemKey(a, 0)] = 'strength';
    expect(JSON.stringify(cardWeek(week, b))).toBe(before);
    expect(JSON.stringify(cardWeek(week, a))).not.toBe(JSON.stringify(cardWeek(busyWeek(), a)));
  });
  it("keeps only the card's own exercises' logs", () => {
    const logs = busyLogs(); const s = extra[0];
    expect(Object.keys(cardLogs(logs, s)).sort()).toEqual(['chestpress', 'hipthrust']);
  });
});
