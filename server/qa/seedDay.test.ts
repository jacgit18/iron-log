import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas.ts';
import { localSeedDay, seedToday } from './seedDay.ts';
import { buildPersonaRows } from './seedPlan.ts';

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

/* The seed's rows must not depend on the machine's time zone: callers pass noon UTC of a calendar date and `buildPersonaRows` reads it by UTC.
   Node re-reads TZ when it is set at run time, so each zone is tried in turn (the far east and far west are where a local getter moves the date). */
describe('seed day in any time zone', () => {
  const ZONES = ['UTC', 'Pacific/Auckland', 'Pacific/Kiritimati', 'America/Los_Angeles', 'Pacific/Pago_Pago'];
  const veteran = PERSONAS.find(p => p.id === 'three-year-veteran')!;
  const day = new Date('2026-10-27T12:00:00Z'); // a Tuesday
  const withZone = <T,>(tz: string, f: () => T): T => { const was = process.env.TZ; process.env.TZ = tz; try { return f(); } finally { if (was === undefined) delete process.env.TZ; else process.env.TZ = was; } };

  it('gives the same rows for the same calendar day in every zone', () => {
    const base = JSON.stringify(withZone('UTC', () => buildPersonaRows(veteran, ['latpd', 'dip'], day)));
    for (const tz of ZONES) expect(JSON.stringify(withZone(tz, () => buildPersonaRows(veteran, ['latpd', 'dip'], day))), tz).toBe(base);
  });
  it('localSeedDay is noon UTC of the machine\'s own calendar date, including a Saturday evening west of UTC', () => {
    // 2026-10-31 (Saturday) 23:30 in Los Angeles is Sunday 06:30 UTC.
    const now = new Date('2026-11-01T06:30:00Z');
    expect(withZone('America/Los_Angeles', () => localSeedDay(now)).toISOString()).toBe('2026-10-31T12:00:00.000Z');
    expect(withZone('Pacific/Auckland', () => localSeedDay(now)).toISOString()).toBe('2026-11-01T12:00:00.000Z');
    expect(withZone('UTC', () => localSeedDay(now)).toISOString()).toBe('2026-11-01T12:00:00.000Z');
  });
});
