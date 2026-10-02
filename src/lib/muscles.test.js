import { describe, it, expect } from 'vitest';
import { DEFAULT_CFG, normWeek } from './logic.js';
import { muscleVolume, muscleNames, tagsOf, level, fmtSets, matchesFilter } from './muscles.js';

const cfg = (over = {}) => ({ ...structuredClone(DEFAULT_CFG), ...over });
// Day 1: Hack Squat, Hypertrophy (4 × 15)   Day 2: Farmers Carry or DB Lunge, Strength (4 × 6)
// Day 3: Canoe Stretch (mobility)           Day 4: an exercise with no muscle tags
const prog = { key: 'T', days: [
  { slots: [{ id: 's1', items: [{ ex: 'hack', ph: 'hyp' }] }] },
  { slots: [{ id: 's2', type: 'either', items: [{ ex: 'farmers', ph: 'strength' }, { ex: 'dblunge', ph: 'strength' }] }] },
  { slots: [{ id: 's3', items: [{ ex: 'canoe', ph: null }] }] },
  { slots: [{ id: 's4', items: [{ ex: 'my-lift', ph: 'strength' }] }] },
  { slots: [] }, { slots: [] },
] };
const sets = (vol, ...ms) => ms.map(m => vol[m].sets);

describe('muscleVolume: planned weekly sets per muscle', () => {
  it('counts each set on the primary muscles, and each option of an either/or as half', () => {
    const { vol } = muscleVolume(cfg(), normWeek(null), prog, false, false);
    // Hack Squat 4 on quads; DB Lunge 4 × ½ on quads and glutes; Farmers Carry 4 × ½ on forearms and traps
    expect(sets(vol, 'quads', 'glutes', 'forearms', 'traps', 'adductors')).toEqual([6, 2, 2, 2, 0]);
  });
  it('adds secondary muscles at half a set when asked', () => {
    const { vol } = muscleVolume(cfg(), normWeek(null), prog, false, true);
    // glutes: Hack 4 × ½ secondary + Lunge 2 primary; adductors: Hack 2 + Lunge 2 × ½
    expect(sets(vol, 'quads', 'glutes', 'adductors', 'hamstrings', 'abs')).toEqual([6, 4, 3, 1, 1]);
  });
  it('leaves out mobility work and lists exercises with no tags', () => {
    const { vol, untagged } = muscleVolume(cfg(), normWeek(null), prog, false, true);
    expect(untagged).toEqual(['my-lift']);
    expect(Object.values(vol).some(v => v.ex.some(e => e.ex === 'canoe'))).toBe(false);
  });
  it('lists which exercises train a muscle, on which day and in what role', () => {
    const { vol } = muscleVolume(cfg(), normWeek(null), prog, false, true);
    expect(vol.quads.ex).toEqual([
      { ex: 'hack', role: 'p', day: 1, sets: 4, either: false },
      { ex: 'dblunge', role: 'p', day: 2, sets: 2, either: true },
    ]);
  });
  it('this week’s view follows this week’s phase changes and moves; the plan view doesn’t', () => {
    const week = normWeek({ ph: { 's1:0': 'exp' }, moved: { s1: 5 } }); // Explosive is 3 × 10
    const live = muscleVolume(cfg(), week, prog, true, false).vol;
    expect(live.quads.sets).toBe(5);
    expect(live.quads.ex[0].day).toBe(5);
    const plan = muscleVolume(cfg(), week, prog, false, false).vol;
    expect(plan.quads.sets).toBe(6);
    expect(plan.quads.ex[0].day).toBe(1);
    // A saved phase default counts in both views.
    expect(muscleVolume(cfg({ phDef: { 's1:0': 'exp' } }), normWeek(null), prog, false, false).vol.quads.sets).toBe(5);
  });
  it('uses your own muscle tags over the built-in ones', () => {
    const { vol, untagged } = muscleVolume(cfg({ muscleMap: { 'my-lift': { p: ['chest'] }, hack: { p: ['hamstrings'] } } }), normWeek(null), prog, false, false);
    expect(untagged).toEqual([]);
    expect(sets(vol, 'chest', 'hamstrings', 'quads')).toEqual([4, 4, 2]);
  });
});

describe('muscle helpers', () => {
  it('names the muscles an exercise trains', () => {
    expect(muscleNames(cfg(), 'hack', 'p')).toBe('Quads');
    expect(muscleNames(cfg(), 'hack', 's')).toBe('Glutes, Inner thigh (adductors)');
    expect([muscleNames(cfg(), 'canoe', 'p'), muscleNames(cfg(), 'canoe', 's')]).toEqual(['Mobility', '']);
    expect(muscleNames(cfg(), 'unknown', 'p')).toBe('');
    expect(tagsOf(cfg({ muscleMap: { hack: { mob: true } } }), 'hack')).toEqual({ mob: true });
  });
  it('shades the map by weekly sets: none, under 5, under 10, up to 20, more', () => {
    expect([0, 0.5, 4.5, 5, 9.5, 10, 20, 20.5].map(level)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
  it('shows sets to the nearest half', () => {
    expect([2, 2.25, 3.2, 7.5].map(fmtSets)).toEqual(['2', '2.5', '3', '7.5']);
  });
  it('the live view counts experiment cards added to the week; the plan view does not', () => {
    const c = cfg();
    const base = muscleVolume(c, normWeek({}), prog, true, false).vol;
    const w = normWeek({ extra: [{ id: 'X-1', day: 2, ex: 'hack', ph: 'hyp' }] });
    const live = muscleVolume(c, w, prog, true, false).vol;
    const grew = Object.keys(live).filter(k => live[k].sets > base[k].sets);
    expect(grew.length).toBeGreaterThan(0);
    expect(live[grew[0]].ex.some(e => e.ex === 'hack' && e.day === 2)).toBe(true);
    expect(muscleVolume(c, w, prog, false, false).vol).toEqual(muscleVolume(c, normWeek({}), prog, false, false).vol);
  });
});

describe('board filter', () => {
  const card = ex => ({ id: 'c', items: [{ ex }] });
  it('matches primary and secondary muscles, equipment and stretches', () => {
    const c = cfg();
    expect(matchesFilter(c, card('hack'), { muscle: 'quads' })).toBe(true);
    expect(matchesFilter(c, card('hack'), { muscle: 'glutes' })).toBe(true); // secondary
    expect(matchesFilter(c, card('hack'), { muscle: 'chest' })).toBe(false);
    expect(matchesFilter(c, card('hack'), { muscle: 'quads', eq: 'machine' })).toBe(true);
    expect(matchesFilter(c, card('hack'), { eq: 'cable' })).toBe(false);
    expect(matchesFilter(c, card('canoe'), { muscle: 'stretch' })).toBe(true);
    expect(matchesFilter(c, card('hack'), { muscle: 'stretch' })).toBe(false);
    expect(matchesFilter(c, card('hack'), {})).toBe(true);
  });
  it('leaves a custom stretch out of the muscle counts', () => {
    const c = cfg({ ex: { 'hip-90': { n: 'Hip 90/90', stretch: true } } });
    const p = { key: 'T', days: [{ slots: [{ id: 'x', items: [{ ex: 'hip-90', ph: null }] }] }] };
    const { vol, untagged } = muscleVolume(c, normWeek(null), p, false, true);
    expect(Object.values(vol).every(v => v.sets === 0)).toBe(true);
    expect(untagged).toEqual([]);
  });
});
