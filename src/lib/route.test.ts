import { describe, expect, it } from 'vitest';
import { PATHS, pageOf, parseRoute, PROGRESS_PAGES, routeHash } from './route.js';

// Screen addresses (brief navigation-urls): every address round-trips, an unknown one falls back to the screen above it, and none can carry personal data.
describe('parseRoute', () => {
  it('round-trips every known screen, and names its tab', () => {
    for (const p of PATHS) expect(parseRoute(routeHash(p))).toEqual({ tab: p.split('/')[0], path: p });
  });
  it('has a screen for each Progress page', () => {
    for (const p of PROGRESS_PAGES) expect(parseRoute(`#/progress/${p}`)?.path).toBe(`progress/${p}`);
  });
  it('falls back to the nearest known screen above an unknown ending', () => {
    expect(parseRoute('#/progress/zzz')).toEqual({ tab: 'progress', path: 'progress' });
    expect(parseRoute('#/daily/recipes/1234/edit')).toEqual({ tab: 'daily', path: 'daily/recipes' });
  });
  it('gives null for nothing known, an empty hash, or an anchor that is not ours', () => {
    for (const h of ['', '#', '#/', '#view', '#/nope', '#/nope/progress']) expect(parseRoute(h)).toBeNull();
  });
  it('ignores case, a trailing slash and a query', () => {
    expect(parseRoute('#/Progress/Trends/')).toEqual({ tab: 'progress', path: 'progress/trends' });
    expect(parseRoute('#/program?x=1')).toEqual({ tab: 'program', path: 'program' });
  });
  it('holds screen names only: letters and slashes, no ids, emails, numbers or personal words', () => {
    for (const p of PATHS) expect(p).toMatch(/^[a-z]+(\/[a-z]+)*$/);
  });
});

describe('pageOf', () => {
  it('returns the part under a base, and null otherwise', () => {
    expect(pageOf('progress/trends', 'progress')).toBe('trends');
    expect(pageOf('progress', 'progress')).toBeNull();
    expect(pageOf('program/exercises', 'progress')).toBeNull();
    expect(pageOf('progress/zzz', 'progress')).toBeNull(); // not a screen
    expect(pageOf('daily/grocery/spend', 'daily/grocery')).toBe('spend');
  });
});
