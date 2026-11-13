import { describe, expect, it } from 'vitest';
import { countTab, nutritionTabs, shadeTabs, tabAfterKey } from './weekDayTabs.js';

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

describe('countTab', () => {
  it('shows done/total and names the visible text first', () => {
    const t = countTab('1', 'D1', 'Day 1', { done: 0, total: 11, full: false });
    expect(t).toMatchObject({ id: '1', head: 'D1', sub: '0/11', done: false, label: 'D1 0/11: Day 1, 0 of 11 done' });
  });
  it('shows a check for a finished day, Rest for a rest day and Skip for a skipped day', () => {
    expect(countTab('2', 'Mon', 'Monday', { done: 3, total: 3, full: true })).toMatchObject({ sub: '\u2713', done: true, label: 'Mon \u2713: Monday, all done' });
    expect(countTab('3', 'D3', 'Day 3', { done: 0, total: 0, full: false }, 'rest')).toMatchObject({ sub: 'Rest', done: true, label: 'D3 Rest: Day 3, rest day' });
    expect(countTab('4', 'Tue', 'Tuesday', { done: 0, total: 5, full: false }, 'skipped')).toMatchObject({ sub: 'Skip', done: true, label: 'Tue Skip: Tuesday, skipped' });
  });
});

describe('shadeTabs', () => {
  const tabs = nutritionTabs('2026-09-24', 0);
  it('marks only the days shown as columns and leaves the rest alone', () => {
    const out = shadeTabs(tabs, [tabs[4]!.id, tabs[5]!.id, tabs[6]!.id]);
    expect(out.map(t => !!t.shaded)).toEqual([false, false, false, false, true, true, true]);
    expect(out[4]).toMatchObject({ id: tabs[4]!.id, head: tabs[4]!.head, today: true });
    expect(out[4]!.label).toBe(`${tabs[4]!.label}, shown below`);
    expect(out[4]!.label.startsWith(`${tabs[4]!.head} ${tabs[4]!.sub}`)).toBe(true);
    expect(out[0]!.label).toBe(tabs[0]!.label);
  });
  it('marks none for an empty window and does not change the input', () => {
    expect(shadeTabs(tabs, []).some(t => t.shaded)).toBe(false);
    expect(tabs.some(t => t.shaded)).toBe(false);
  });
});
