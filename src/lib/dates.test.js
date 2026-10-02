import { describe, it, expect } from 'vitest';
import { ymd, parseDate, monday, addDays, fmtShort, fmtDayDate } from './dates.js';

describe('dates', () => {
  it('formats and parses local calendar dates', () => {
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(ymd(parseDate('2026-12-31'))).toBe('2026-12-31');
    expect(fmtShort(parseDate('2026-09-28'))).toBe('Sep 28');
  });

  it('starts the week on Sunday', () => {
    expect(ymd(monday(parseDate('2026-09-27')))).toBe('2026-09-27'); // Sunday
    expect(ymd(monday(parseDate('2026-10-03')))).toBe('2026-09-27'); // Saturday
    expect(ymd(monday(new Date(2026, 8, 30, 23, 59)))).toBe('2026-09-27');
  });

  it('adds whole days across month, year and daylight-saving changes', () => {
    expect(ymd(addDays(parseDate('2026-12-27'), 7))).toBe('2027-01-03');
    expect(ymd(addDays(parseDate('2026-03-07'), 1))).toBe('2026-03-08');
    expect(ymd(addDays(parseDate('2026-11-01'), 7))).toBe('2026-11-08');
  });

  it('formats a day label with the weekday and a padded month/day', () => {
    expect(fmtDayDate('2026-09-27')).toBe('Sunday 09/27');
    expect(fmtDayDate('2026-10-01')).toBe('Thursday 10/01');
    expect(fmtDayDate('2026-10-03')).toBe('Saturday 10/03');
    expect(fmtDayDate('2027-01-05')).toBe('Tuesday 01/05');
  });
});
