import { describe, it, expect } from 'vitest';
import { backupScore, expiredDates, shouldWrite, BACKUP_DAYS } from './autoBackup.ts';

describe('automatic backup rules', () => {
  it('keeps the last 7 calendar days, today included, and drops older copies', () => {
    const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
    expect(BACKUP_DAYS).toBe(7);
    expect(expiredDates(dates, '2026-10-09')).toEqual(['2026-10-01', '2026-10-02']);
    expect(expiredDates(['2026-10-03'], '2026-10-09')).toEqual([]); // 6 days back is still inside the 7
    expect(expiredDates(['2026-10-02'], '2026-10-09')).toEqual(['2026-10-02']);
    expect(expiredDates([], '2026-10-09')).toEqual([]);
    expect(expiredDates(['2026-02-27'], '2026-03-05')).toEqual([]); // across a month end
  });
  it("does not replace today's copy with one that holds less than half as much, unless the copy is tiny", () => {
    expect(shouldWrite(null, 0)).toBe(true); // nothing saved today yet: even an empty state is today's first copy
    expect(shouldWrite(100, 100)).toBe(true); expect(shouldWrite(100, 50)).toBe(true); expect(shouldWrite(100, 49)).toBe(false);
    expect(shouldWrite(100, 0)).toBe(false); // a wipe or a failed load
    expect(shouldWrite(9, 0)).toBe(true); // a tiny copy is not guarded
  });
  it('counts what a data file holds', () => {
    expect(backupScore({})).toBe(0);
    const logs = { sq: [{ d: '2026-10-01' }, { d: '2026-10-02' }], bp: [{ d: '2026-10-01' }] };
    expect(backupScore({ logs, body: [{ d: '2026-10-01', w: 180 }], library: [], weeks: {}, programs: {}, experiments: [] })).toBe(4);
  });
});
