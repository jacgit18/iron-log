import { describe, it, expect } from 'vitest';
import type { Cfg } from '../types.ts';
import { goalExercises } from './goalRows.js';
import { exerciseOptions } from './exerciseOptions.js';

const cfg = (liftGoals: Cfg['liftGoals'], ex: Cfg['ex'] = {}) => ({ ex, liftGoals } as unknown as Cfg);

describe('goalExercises', () => {
  it('lists exercises with a goal A to Z, logged or not, by name', () => {
    const c = cfg({ latpd: { any: { w: 315, start: 0 } }, 'c:fe:zzz': { hyp: { w: 40, start: 0 } } }, { 'c:fe:zzz': { n: 'Zzz Test Curl' } });
    expect(goalExercises(c).map(r => r.name)).toEqual(['Lat Pulldown, alternating single-arm', 'Zzz Test Curl']);
  });
  it('skips an exercise whose goals have no weight', () => {
    expect(goalExercises(cfg({ latpd: { any: { w: 0, start: 0 } } }))).toEqual([]);
    expect(goalExercises(cfg(undefined))).toEqual([]);
  });
});

describe('exerciseOptions', () => {
  it('lists each name once and marks a catalog exercise Library', () => {
    const c = cfg({}, { 'c:fe:zzz': { n: 'Zzz Test Curl' } });
    const o = exerciseOptions(c, ['latpd']);
    expect(o.filter(x => x.id === 'latpd')).toHaveLength(1);
    expect(o.find(x => x.id === 'c:fe:zzz')).toMatchObject({ badge: 'Library', name: 'Zzz Test Curl' });
  });
});
