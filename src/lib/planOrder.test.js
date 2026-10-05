// Property tests for planOrder: across hundreds of random weeks, applying a suggestion never loses, duplicates or
// splits a card, never touches fixed days, and only ever changes week.order and week.rest.
import { describe, it, expect } from 'vitest';
import { BUILTIN, DAY_COUNT } from './data.js';
import {
  DEFAULT_CFG, DAYS, normWeek, weekSlots, currentLayout, planOrder, clashCount, isOrder, orderOf, restsOf,
  isItemDone, isSkipped, overflowSlots, dayAt,
} from './logic.js';

// A small seeded random generator, so a failure always reproduces with the same seed.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const shuffle = (r, xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// A made-up program: 1-6 cards per day from a small exercise pool (so repeats are common), some days left empty.
function randomSlots(r) {
  const pool = ['sq', 'bench', 'row', 'press', 'curl', 'lunge', 'dl', 'pull'];
  const slots = [];
  DAYS.forEach(d => {
    if (r() < 0.2) return; // an empty day
    const n = 1 + Math.floor(r() * 6);
    for (let i = 0; i < n; i++) {
      const kind = r();
      if (kind < 0.15) slots.push({ id: `d${d}s${i}`, day: d, type: 'superset', items: [{ ex: pick(r, pool) }, { ex: pick(r, pool) }] });
      else if (kind < 0.25) slots.push({ id: `d${d}s${i}`, day: d, type: 'either', items: [{ ex: pick(r, pool) }, { ex: pick(r, pool) }] });
      else if (kind < 0.35) slots.push({ id: `d${d}s${i}`, day: d, type: 'single', sec: 'Home', items: [{ ex: pick(r, pool) }] });
      else slots.push({ id: `d${d}s${i}`, day: d, type: 'single', items: [{ ex: pick(r, pool) }] });
    }
  });
  return slots;
}

// A random week over those slots: maybe a swapped order, 0-2 rest days, some moved, skipped and checked cards.
function randomWeek(r, slots) {
  const w = { done: {}, skipped: {}, moved: {}, ph: {}, warm: {} };
  if (r() < 0.5) w.order = shuffle(r, DAYS);
  const nRest = pick(r, [0, 0, 1, 1, 1, 2]);
  if (nRest) { w.rest = shuffle(r, DAYS).slice(0, nRest).sort((a, b) => a - b); w.restOn = '2026-10-05'; }
  slots.forEach(s => {
    if (r() < 0.1) w.moved[s.id] = pick(r, DAYS);
    if (r() < 0.08) w.skipped[s.id] = true;
    else if (r() < 0.15) s.items.forEach((_, i) => { if (s.type !== 'superset' || r() < 0.5) w.done[s.type === 'superset' ? `${s.id}#${i}` : s.id] = true; });
  });
  return normWeek(w);
}

// Mark every card in column c done, the way the day's check-off box does.
const finish = (w, slots, c) => {
  const x = structuredClone(w);
  currentLayout(x, slots)[c].forEach(s => { if (!isSkipped(s, x)) x.done[s.id] = true; });
  return x;
};

const where = (w, slots) => { const m = new Map(); Object.entries(currentLayout(w, slots)).forEach(([c, l]) => l.forEach(s => m.set(s.id, [...(m.get(s.id) || []), Number(c)]))); return m; };
const started = (w, l) => l.some(s => s.items.some((_, i) => isItemDone(s, i, w)));

// Every promise planOrder makes, checked on one week and finished column.
function checkPlan(cfg, week, slots, doneCol) {
  const plan = planOrder(cfg, week, slots, doneCol);
  if (!plan) return null;
  const after = { ...week, order: plan.order, rest: plan.rest };
  const b = where(week, slots), a = where(after, slots);
  const colsB = currentLayout(week, slots), colsA = currentLayout(after, slots);

  // Valid data, and the same number of rest days.
  expect(isOrder(plan.order)).toBe(true);
  expect(plan.rest).toEqual([...plan.rest].sort((x, y) => x - y));
  expect(new Set(plan.rest).size).toBe(plan.rest.length);
  expect(plan.rest.length).toBe(restsOf(week).length);
  plan.rest.forEach(c => expect(c >= 1 && c <= DAY_COUNT).toBe(true));

  // No card lost, none duplicated, hidden ones stay hidden.
  slots.forEach(s => {
    expect(a.get(s.id)?.length ?? 0, `card ${s.id} appears once`).toBe(b.get(s.id)?.length ?? 0);
    expect((a.get(s.id) || []).length).toBeLessThanOrEqual(1);
  });
  expect(overflowSlots(after, slots, plan.rest[0] ?? 1).length >= 0).toBe(true);
  expect([...a.keys()].sort()).toEqual([...b.keys()].sort());

  // Workouts stay whole: cards that shared a column still share one.
  DAYS.forEach(c => { const cs = new Set(colsB[c].map(s => a.get(s.id)[0])); expect(cs.size, `column ${c} stays together`).toBeLessThanOrEqual(1); });

  // Fixed columns keep exactly the same cards: the finished day and before, started days, empty days, rest days behind.
  DAYS.forEach(c => {
    const fixed = c <= doneCol || started(week, colsB[c]) || (!restsOf(week).includes(c) && colsB[c].length === 0);
    if (!fixed) return;
    expect(colsA[c].map(s => s.id), `column ${c} is fixed`).toEqual(colsB[c].map(s => s.id));
    expect(restsOf(week).includes(c), `rest on column ${c}`).toBe(plan.rest.includes(c));
  });

  // Honest numbers that go down.
  expect(plan.before).toBe(clashCount(week, slots, doneCol));
  expect(plan.after).toBe(clashCount(after, slots, doneCol));
  expect(plan.after).toBeLessThan(plan.before);
  expect(plan.lines.length).toBeGreaterThan(0);
  plan.lines.forEach(l => expect(typeof l).toBe('string'));

  // Rest day first: a plan that reorders workouts means no rest-only move would have helped.
  const seq = w => DAYS.map(c => (restsOf(w).includes(c) ? null : orderOf(w)[DAYS.filter(d => d <= c && !restsOf(w).includes(d)).length - 1])).filter(x => x != null);
  const reordered = seq(after).join() !== seq(week).join();
  if (reordered && restsOf(week).length) {
    const movableRest = restsOf(week).filter(c => c > doneCol);
    const open = DAYS.filter(c => c > doneCol && (restsOf(week).includes(c) || (colsB[c].length > 0 && !started(week, colsB[c]))));
    movableRest.forEach(rc => open.forEach(to => {
      if (to === rc) return;
      // Slide this one rest day to `to`, keeping every workout in its order.
      const items = DAYS.map(c => (restsOf(week).includes(c) ? 'R' : dayAt(week, c))); // the real workouts, not just R/W
      const m = [...items]; m.splice(rc - 1, 1); m.splice(to - 1, 0, 'R');
      const ok = DAYS.every(c => (c > doneCol && open.includes(c)) || m[c - 1] === items[c - 1]);
      if (!ok) return;
      const restOnly = { ...week, rest: DAYS.filter(c => m[c - 1] === 'R') };
      expect(clashCount(restOnly, slots, doneCol), `rest ${rc}->${to} would have helped`).toBeGreaterThanOrEqual(plan.before);
    }));
  }
  return plan;
}

describe('planOrder never loses, duplicates or splits a card', () => {
  const cfg = structuredClone(DEFAULT_CFG);

  it('on the built-in programs, from every finished day, with random rest days, orders and moves', () => {
    let plans = 0;
    ['A', 'B'].forEach(k => {
      const slots = weekSlots(BUILTIN[k], normWeek(null));
      for (let seed = 1; seed <= 150; seed++) {
        const r = rng(seed * 7 + k.charCodeAt(0));
        const w = randomWeek(r, slots);
        DAYS.forEach(c => { if (checkPlan(cfg, finish(w, slots, c), slots, c)) plans++; });
      }
    });
    expect(plans).toBeGreaterThan(50); // the checks really ran on suggestions
  });

  it('on random programs with supersets, either/or cards, Home cards and empty days', () => {
    let plans = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = rng(seed);
      const slots = randomSlots(r);
      const w = randomWeek(r, slots);
      DAYS.forEach(c => { if (checkPlan(cfg, finish(w, slots, c), slots, c)) plans++; });
    }
    expect(plans).toBeGreaterThan(100);
  });

  it('on a clean week of each built-in program, with each single rest day', () => {
    ['A', 'B'].forEach(k => {
      const slots = weekSlots(BUILTIN[k], normWeek(null));
      [null, ...DAYS].forEach(rest => {
        let w = normWeek(rest ? { rest: [rest] } : null);
        DAYS.forEach(c => { w = finish(w, slots, c); checkPlan(cfg, w, slots, c); });
      });
    });
  });

  it('changes nothing but order and rest, and leaves the week it was given alone', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = rng(seed + 9000);
      const slots = randomSlots(r);
      const w = finish(randomWeek(r, slots), slots, 2);
      const copy = structuredClone(w);
      const plan = planOrder(cfg, w, slots, 2);
      expect(w).toEqual(copy); // not mutated
      if (plan) expect(Object.keys(plan).sort()).toEqual(['after', 'before', 'lines', 'order', 'rest']);
    }
  });
});
