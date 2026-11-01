import { describe, expect, it } from 'vitest';
import { loggedEntryFor } from './loggedEntry.js';
import type { LogEntry } from '../types.ts';

const e = (d: string, slot: string, wk: string, extra: Partial<LogEntry> = {}): LogEntry => ({ d, ph: null, w: 100, s: 3, r: 8, slot, wk, ...extra });

describe('loggedEntryFor', () => {
  it('finds the entry for this card and week', () => {
    const list = [e('2026-10-26', 'a', '2026-10-26'), e('2026-11-02', 'a', '2026-11-02'), e('2026-11-02', 'b', '2026-11-02')];
    expect(loggedEntryFor(list, 'a', '2026-11-02')).toBe(list[1]);
  });
  it('returns the later one when a card has two this week', () => {
    const list = [e('2026-11-02', 'a', '2026-11-02'), e('2026-11-04', 'a', '2026-11-02', { w: 105 })];
    expect(loggedEntryFor(list, 'a', '2026-11-02')?.w).toBe(105);
  });
  it('returns null with no entry or no list', () => {
    expect(loggedEntryFor([e('2026-11-02', 'a', '2026-10-26')], 'a', '2026-11-02')).toBeNull();
    expect(loggedEntryFor(undefined, 'a', '2026-11-02')).toBeNull();
  });
});
