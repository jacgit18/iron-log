import { describe, expect, it } from 'vitest';
import { seedToday } from './seedDay.ts';

const NOW = new Date('2026-11-09T00:46:00Z');

describe('seedToday', () => {
  it('uses the browser date when it is the day before the server date', () => {
    expect(seedToday(NOW, '2026-11-08').toISOString()).toBe('2026-11-08T12:00:00.000Z');
  });
  it('uses the browser date when it is the same day or the day after', () => {
    expect(seedToday(NOW, '2026-11-09').toISOString()).toBe('2026-11-09T12:00:00.000Z');
    expect(seedToday(NOW, '2026-11-10').toISOString()).toBe('2026-11-10T12:00:00.000Z');
  });
  it('ignores a date more than a day away, a fake date and anything that is not a date string', () => {
    for (const bad of ['2026-11-07', '2026-11-11', '2026-02-30', '2026-13-01', '11/08/2026', '', 20261108, null, undefined, {}]) expect(seedToday(NOW, bad)).toBe(NOW);
  });
});
