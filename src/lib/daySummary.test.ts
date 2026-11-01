import { describe, expect, it } from 'vitest';
import type { Cfg, ProgramDay, ProgramSlot } from '../types.ts';
import { daySummary, SUMMARY_MUSCLES } from './daySummary';

const cfg = { ex: {}, phDef: {}, rxOverride: {}, equipment: {}, muscleMap: {} } as unknown as Cfg;
const slot = (id: string, ex: string, over: Partial<ProgramSlot> = {}): ProgramSlot => ({ id, type: 'single', items: [{ ex, ph: 'strength', w: null, rx: '4 × 6' }], ...over });
const day = (slots: ProgramSlot[]): ProgramDay => ({ title: 'Day 1', slots });

describe('daySummary', () => {
  it('an empty day is all zeros and empty lists', () => {
    expect(daySummary(cfg, day([]))).toEqual({ exercises: 0, sets: 0, phases: [], muscles: [], moreMuscles: 0, equipment: [] });
  });
  it('counts exercises (a superset is its exercises) and planned sets from each prescription', () => {
    const sup = slot('s', 'hack', { type: 'superset', items: [{ ex: 'hack', ph: 'hyp', w: null, rx: '3 × 12' }, { ex: 'legext', ph: 'hyp', w: null, rx: '3 × 12' }] });
    const s = daySummary(cfg, day([slot('a', 'hack'), sup]));
    expect(s.exercises).toBe(3);
    expect(s.sets).toBe(4 + 3 + 3);
  });
  it('an either/or card counts half its sets, and a card with no prescription counts 3', () => {
    const either = slot('e', 'hack', { type: 'either', items: [{ ex: 'hack', ph: 'strength', w: null, rx: '4 × 6' }, { ex: 'legext', ph: 'strength', w: null, rx: '4 × 6' }] });
    const bare = slot('b', 'hack', { items: [{ ex: 'hack', ph: null, w: null }] });
    expect(daySummary(cfg, day([either])).sets).toBe(4);
    expect(daySummary(cfg, day([bare])).sets).toBe(3);
  });
  it('phase mix counts cards per phase in a fixed order and leaves out a card with no phase', () => {
    const s = daySummary(cfg, day([slot('a', 'hack', { items: [{ ex: 'hack', ph: 'exp', w: null }] }), slot('b', 'hack'), slot('c', 'hack'), slot('d', 'hack', { items: [{ ex: 'hack', ph: null, w: null }] })]));
    expect(s.phases).toEqual([{ key: 'strength', count: 2 }, { key: 'exp', count: 1 }]);
  });
  it('muscles are primary sets, most first, capped with a count of the rest; mobility is left out', () => {
    const s = daySummary(cfg, day([slot('a', 'hack'), slot('b', 'bss'), slot('c', 'canoe')]));
    expect(s.muscles[0]).toMatchObject({ key: 'quads', sets: 8 });
    expect(s.muscles.map(m => m.key)).toContain('glutes');
    expect(s.muscles.length).toBeLessThanOrEqual(SUMMARY_MUSCLES);
    expect(s.muscles.some(m => m.sets === 0)).toBe(false);
  });
  it('an exercise with no muscle tags adds sets but no muscle', () => {
    const s = daySummary(cfg, day([slot('a', 'no-such-exercise')]));
    expect(s.sets).toBe(4); expect(s.muscles).toEqual([]);
  });
  it('lists equipment of the exercises with a count, most first', () => {
    const c = { ...cfg, ex: { a: { n: 'A', eq: 'cable' }, b: { n: 'B', eq: 'cable' }, c: { n: 'C', eq: 'sled' } } } as unknown as Cfg;
    const s = daySummary(c, day([slot('1', 'a'), slot('2', 'b'), slot('3', 'c')]));
    expect(s.equipment.map(e => [e.id, e.count])).toEqual([['cable', 2], ['sled', 1]]);
  });
});
