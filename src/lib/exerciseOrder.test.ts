import { describe, expect, it } from 'vitest';
import { newestFirst } from './exerciseOrder.js';
import type { LogEntry } from '../types.ts';

const e = (d: string, updatedAt?: string): LogEntry => ({ d, w: 100, s: 3, r: 8, ...(updatedAt ? { updatedAt } : {}) });
const name = (id: string) => id;

describe('newestFirst', () => {
  it('puts the later date first', () => {
    expect(newestFirst(['a', 'b'], { a: [e('2026-10-01')], b: [e('2026-10-05')] }, name)).toEqual(['b', 'a']);
  });
  it('orders two exercises logged the same day by the time they were saved', () => {
    const logs = { a: [e('2026-10-05', '2026-10-05T09:00:00Z')], b: [e('2026-10-05', '2026-10-05T18:00:00Z')] };
    expect(newestFirst(['a', 'b'], logs, name)).toEqual(['b', 'a']);
  });
  it('uses the newest entry, not the last one in the list', () => {
    const logs = { a: [e('2026-10-05', '2026-10-05T20:00:00Z'), e('2026-10-05', '2026-10-05T08:00:00Z')], b: [e('2026-10-05', '2026-10-05T12:00:00Z')] };
    expect(newestFirst(['a', 'b'], logs, name)).toEqual(['a', 'b']);
  });
  it('falls back to the name when there is no stamp (older data)', () => {
    expect(newestFirst(['b', 'a'], { a: [e('2026-10-05')], b: [e('2026-10-05')] }, name)).toEqual(['a', 'b']);
  });
  it('skips an exercise with no entries', () => {
    expect(newestFirst(['a', 'b'], { a: [], b: [e('2026-10-05')] }, name)).toEqual(['b']);
  });
});
