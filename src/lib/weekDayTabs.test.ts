import { describe, expect, it } from 'vitest';
import { nutritionTabs, tabAfterKey } from './weekDayTabs.js';

describe('tabAfterKey', () => {
  it('moves right and left and wraps at the ends', () => {
    expect(tabAfterKey('ArrowRight', 0, 7)).toBe(1);
    expect(tabAfterKey('ArrowRight', 6, 7)).toBe(0);
    expect(tabAfterKey('ArrowLeft', 0, 7)).toBe(6);
    expect(tabAfterKey('ArrowLeft', 3, 7)).toBe(2);
  });
  it('jumps with Home and End and ignores other keys', () => {
    expect(tabAfterKey('Home', 4, 7)).toBe(0);
    expect(tabAfterKey('End', 1, 7)).toBe(6);
    expect(tabAfterKey('a', 1, 7)).toBeNull();
    expect(tabAfterKey('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('nutritionTabs', () => {
  const today = '2026-09-24'; // a Thursday
  it('lists the seven days of the shown week, Sunday first, and marks today', () => {
    const t = nutritionTabs(today, 0);
    expect(t.map(x => x.id)).toEqual(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26']);
    expect(t.map(x => x.head)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(t.map(x => x.sub)).toEqual(['20', '21', '22', '23', '24', '25', '26']);
    expect(t.filter(x => x.today).map(x => x.id)).toEqual([today]);
  });
  it('names the visible text first, then the full day, and says today', () => {
    const t = nutritionTabs(today, 0)[4]!;
    expect(t.label).toBe('Thu 24: Thursday 24, today');
    expect(t.label.startsWith(`${t.head} ${t.sub}`)).toBe(true);
  });
  it('shows last and next week as their own seven days with no today mark', () => {
    expect(nutritionTabs(today, -1)[0]!.id).toBe('2026-09-13');
    expect(nutritionTabs(today, 1)[6]!.id).toBe('2026-10-03');
    expect(nutritionTabs(today, 1).some(x => x.today)).toBe(false);
  });
});
