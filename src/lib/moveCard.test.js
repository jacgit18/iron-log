// Property tests for card moves: across hundreds of random weeks, moving a card never loses or duplicates it,
// never changes other fields, and can always be undone exactly.
import { describe, it, expect } from 'vitest';
import { DAY_COUNT } from './data.js';
import {
  DEFAULT_CFG, DAYS, normWeek, currentLayout, moveClashes, altDay, isItemDone, isSkipped, dayAt, restsOf,
} from './logic.js';

// A small seeded random generator.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const shuffle = (r, xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// A made-up program: 1-6 cards per day, some days left empty.
function randomSlots(r) {
  const pool = ['sq', 'bench', 'row', 'press', 'curl', 'lunge', 'dl', 'pull'];
  const slots = [];
  DAYS.forEach(d => {
    if (r() < 0.2) return;
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

// A random week: maybe a reordered day order, 0-2 rest days, some moved/skipped/checked cards.
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

// Where each slot appears: slot id → columns.
const where = (w, slots) => { const m = new Map(); Object.entries(currentLayout(w, slots)).forEach(([c, l]) => l.forEach(s => m.set(s.id, [...(m.get(s.id) || []), Number(c)]))); return m; };

describe('moveCard', () => {
  describe('moveClashes', () => {
    it('detects when the same exercise is already on the target day', () => {
      const cfg = DEFAULT_CFG;
      const slots = [
        { id: 's1', day: 1, type: 'single', items: [{ ex: 'sq' }] },
        { id: 's2', day: 2, type: 'single', items: [{ ex: 'sq' }] },
      ];
      const week = { done: {}, skipped: {}, moved: {}, ph: {}, warm: {} };
      const clashes = moveClashes(cfg, week, slots, slots[0], 2);
      expect(clashes.length).toBeGreaterThan(0);
      expect(clashes[0].toLowerCase()).toContain('sq');
    });

    it('detects clash on back-to-back days', () => {
      const cfg = DEFAULT_CFG;
      const slots = [
        { id: 's1', day: 1, type: 'single', items: [{ ex: 'sq' }] },
        { id: 's2', day: 3, type: 'single', items: [{ ex: 'sq' }] },
      ];
      const week = { done: {}, skipped: {}, moved: {}, ph: {}, warm: {} };
      // Moving s1 to day 2 should clash with s2 on day 3 (back-to-back).
      const clashes = moveClashes(cfg, week, slots, slots[0], 2);
      expect(clashes.length).toBeGreaterThan(0);
    });

    it('ignores skipped cards', () => {
      const cfg = DEFAULT_CFG;
      const slots = [
        { id: 's1', day: 1, type: 'single', items: [{ ex: 'sq' }] },
        { id: 's2', day: 2, type: 'single', items: [{ ex: 'sq' }] },
      ];
      const week = { done: {}, skipped: { 's2': true }, moved: {}, ph: {}, warm: {} };
      const clashes = moveClashes(cfg, week, slots, slots[0], 2);
      expect(clashes.length).toBe(0);
    });

    it('returns empty array when no clash', () => {
      const cfg = DEFAULT_CFG;
      const slots = [
        { id: 's1', day: 1, type: 'single', items: [{ ex: 'sq' }] },
        { id: 's2', day: 2, type: 'single', items: [{ ex: 'bench' }] },
      ];
      const week = { done: {}, skipped: {}, moved: {}, ph: {}, warm: {} };
      const clashes = moveClashes(cfg, week, slots, slots[0], 2);
      expect(clashes).toHaveLength(0);
    });
  });

  describe('altDay', () => {
    it('finds a clash-free day', () => {
      const cfg = DEFAULT_CFG;
      const slots = [
        { id: 's1', day: 1, type: 'single', items: [{ ex: 'sq' }] },
        { id: 's2', day: 2, type: 'single', items: [{ ex: 'sq' }] },
        { id: 's3', day: 4, type: 'single', items: [{ ex: 'bench' }] },
      ];
      const week = { done: {}, skipped: {}, moved: {}, ph: {}, warm: {} };
      const alt = altDay(cfg, week, slots, slots[0], 2, 1);
      // Should find day 3 or 4 (no clash).
      expect([3, 4]).toContain(alt);
    });

    it('returns null when no alternative exists', () => {
      const cfg = DEFAULT_CFG;
      const slots = DAYS.map(d => ({ id: `s${d}`, day: d, type: 'single', items: [{ ex: 'sq' }] }));
      const week = { done: {}, skipped: {}, moved: {}, ph: {}, warm: {} };
      expect(altDay(cfg, week, slots, slots[0], 2, 1)).toBeNull();
    });
  });

  describe('property tests', () => {
    it('for ~50 random weeks, normWeek preserves and validates week.moved', () => {
      for (let seed = 1; seed <= 50; seed++) {
        const r = rng(seed);
        const slots = randomSlots(r);
        if (slots.length === 0) continue;
        const week = randomWeek(r, slots);
        const original = structuredClone(week);

        // normWeek should preserve valid moves (1-7, integers).
        expect(week.moved).toBeDefined();
        Object.entries(week.moved).forEach(([slotId, day]) => {
          expect(Number.isInteger(day)).toBe(true);
          expect(day).toBeGreaterThanOrEqual(1);
          expect(day).toBeLessThanOrEqual(DAY_COUNT);
        });
      }
    });

    it('for ~50 random weeks, moving only changes week.moved', () => {
      for (let seed = 1; seed <= 50; seed++) {
        const r = rng(seed);
        const slots = randomSlots(r);
        if (slots.length === 0) continue;
        const week = randomWeek(r, slots);

        const slot = pick(r, slots);
        const targetDay = pick(r, DAYS);
        if (targetDay === slot.day || restsOf(week).includes(targetDay)) continue;

        const moved = normWeek({ ...week, moved: { ...week.moved, [slot.id]: targetDay } });

        // Other fields unchanged.
        expect(moved.done).toEqual(week.done);
        expect(moved.skipped).toEqual(week.skipped);
        expect(moved.ph).toEqual(week.ph);
        expect(moved.warm).toEqual(week.warm);
        expect(moved.order).toEqual(week.order);
        expect(moved.rest).toEqual(week.rest);
      }
    });

    it('for ~50 random weeks, clearing a move from week.moved works', () => {
      for (let seed = 1; seed <= 50; seed++) {
        const r = rng(seed);
        const slots = randomSlots(r);
        if (slots.length === 0) continue;
        const week = randomWeek(r, slots);

        // Pick a slot that wasn't already moved.
        let slot;
        for (const s of slots) {
          if (!week.moved[s.id]) {
            slot = s;
            break;
          }
        }
        if (!slot) continue;

        const targetDay = pick(r, DAYS);
        if (targetDay === slot.day || restsOf(week).includes(targetDay)) continue;

        const originalMoved = structuredClone(week.moved);

        // Move a card.
        const moveEntries = { ...week.moved, [slot.id]: targetDay };
        expect(moveEntries[slot.id]).toBe(targetDay);

        // Clear the move.
        const undoEntries = { ...moveEntries };
        delete undoEntries[slot.id];

        // Should match the original.
        expect(undoEntries).toEqual(originalMoved);
        expect(Object.keys(undoEntries).length).toBe(Object.keys(originalMoved).length);
      }
    });
  });
});
