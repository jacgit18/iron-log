import { describe, expect, it } from 'vitest';
import { daysOn, ideaDayChoices } from './ideaDays.js';
import type { Week } from '../types.ts';

const wk = (o: Partial<Week>) => ({ rest: [], extra: [], moved: {}, ...o }) as unknown as Week;

describe('ideaDayChoices', () => {
  it('lists the board columns in order, without rest days', () => {
    expect(ideaDayChoices(wk({ rest: [3, 7] }), 'x', null).map(d => d.col)).toEqual([1, 2, 4, 5, 6]);
  });
  it('marks today and the days the exercise is already on, following a dragged card', () => {
    const w = wk({ extra: [{ id: 'X-1', day: 2, ex: 'x' }, { id: 'X-2', day: 5, ex: 'y' }] as never, moved: { 'X-1': 4 } });
    const r = ideaDayChoices(w, 'x', 5);
    expect(r.filter(d => d.on).map(d => d.col)).toEqual([4]);
    expect(r.find(d => d.today)?.col).toBe(5);
    expect(ideaDayChoices(w, 'x', null).some(d => d.today)).toBe(false);
    expect(daysOn(w, 'x')).toEqual([4]);
  });
});
