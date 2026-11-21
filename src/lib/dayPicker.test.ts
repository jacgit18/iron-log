import { describe, expect, it } from 'vitest';
import { dayReason, goLabel, lastPlanDay, moveButton, onwardDays, plannedText, ONE_OFF_REASON, pickerDays, pickerWeek, pickerWeekRange, quickPicks, resultText, type PickerSource } from './dayPicker.js';
import { dayLabel, sundayOf } from './dayNames.js';
import { oldestDay, shiftDay } from './dietLog.js';

const today = '2026-11-14'; // a Saturday
const linked: PickerSource = { kind: 'eaten', entry: { d: today, from: 'r1' } };
const oneOff: PickerSource = { kind: 'eaten', entry: { d: today } };
const planned: PickerSource = { kind: 'plan', day: today };

describe('dayReason', () => {
  it('greys the own day, a source on a future day, and days outside the window', () => {
    expect(dayReason(linked, today, today)).toBe('That is its own day.');
    expect(dayReason({ kind: 'eaten', entry: { d: '2026-11-16', from: 'r1' } }, '2026-11-15', today)).toBe('Only food you ate can move or copy.');
    expect(dayReason(linked, '2027-11-14', today)).toBe('You can plan the next 52 weeks.'); // today + 365
    expect(dayReason(linked, '2027-11-13', today)).toBeNull(); // today + 364
    expect(dayReason(linked, shiftDay(oldestDay(today), -1), today)).toMatch(/400 days/);
    expect(dayReason(linked, oldestDay(today), today)).toBeNull();
  });
  it('lets a recipe-linked eaten food go ahead and greys days ahead for a one-off', () => {
    expect(dayReason(linked, '2026-11-15', today)).toBeNull();
    expect(dayReason(oneOff, '2026-11-15', today)).toBe(ONE_OFF_REASON);
    expect(dayReason(oneOff, '2026-11-13', today)).toBeNull(); // earlier days are fine
  });
  it('a planned item goes to today and days ahead, not before today or to its own day', () => {
    expect(dayReason({ kind: 'plan', day: '2026-11-16' }, today, today)).toBeNull();
    expect(dayReason(planned, '2026-11-13', today)).toBe('You can plan today and the next 52 weeks.');
    expect(dayReason(planned, today, today)).toBe('That is its own day.');
    expect(dayReason(planned, '2027-11-14', today)).toBe('You can plan the next 52 weeks.');
  });
  it('the last plannable day is today + 364', () => { expect(lastPlanDay(today)).toBe('2027-11-13'); });
});

describe('pickerDays', () => {
  it('runs from the oldest kept day to today + 364 with a reason per greyed day', () => {
    const all = pickerDays(linked, today);
    expect(all[0]!.id).toBe(oldestDay(today));
    expect(all.at(-1)!.id).toBe('2027-11-13');
    expect(all.find(d => d.id === today)).toMatchObject({ label: 'Sat 14 · today', reason: 'That is its own day.' });
    expect(all.filter(d => d.id > today).every(d => d.reason === null)).toBe(true);
    expect(pickerDays(oneOff, today).filter(d => d.id > today).every(d => d.reason === ONE_OFF_REASON)).toBe(true);
  });
  it('starts a planned source at today', () => { expect(pickerDays(planned, today)[0]!.id).toBe(today); });
});

describe('pickerWeek', () => {
  it('from a Saturday the next Monday is one arrow away', () => {
    const w = pickerWeek(linked, today, '2026-11-08'); // the week today is in
    expect(w.days.map(d => d.id)[0]).toBe('2026-11-08');
    expect(w.next).toBe('2026-11-15');
    const n = pickerWeek(linked, today, w.next!);
    expect(n.days.find(d => d.id === '2026-11-16')).toMatchObject({ reason: null, label: 'Mon 16' });
  });
  it('the last week greys the days beyond the window and has no next arrow', () => {
    const w = pickerWeek(linked, today, '2027-11-07');
    expect(w.next).toBeNull();
    expect(w.days.find(d => d.id === '2027-11-13')!.reason).toBeNull(); // the last day, a Saturday, ends the week: nothing greyed
    const wed = '2026-11-11', v = pickerWeek({ kind: 'plan', day: wed }, wed, '2027-11-07'); // a Wednesday today puts the window's end mid-week
    expect(v.days.find(d => d.id === '2027-11-10')!.reason).toBeNull();
    expect(v.days.find(d => d.id === '2027-11-11')!.reason).toBe('You can plan the next 52 weeks.');
  });
  it('clamps a week outside the range and has no previous arrow at the start', () => {
    const { first, last } = pickerWeekRange(linked, today);
    expect(pickerWeek(linked, today, '2000-01-02').start).toBe(first);
    expect(pickerWeek(linked, today, '2099-01-03').start).toBe(last);
    expect(pickerWeek(linked, today, first).prev).toBeNull();
    expect(pickerWeek(planned, today, '2026-11-01').start).toBe('2026-11-08');
  });
});

describe('quickPicks', () => {
  it('Tomorrow, Next 7 days, Weekdays for two weeks, clipped to what can be ticked', () => {
    const q = Object.fromEntries(quickPicks(linked, today).map(p => [p.id, p.days]));
    expect(q.tomorrow).toEqual(['2026-11-15']);
    expect(q.next7).toHaveLength(7);
    expect(q.next7![0]).toBe('2026-11-15');
    expect(q.weekdays).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']);
  });
  it('gives a one-off eaten food no quick picks (all days ahead are greyed)', () => { expect(quickPicks(oneOff, today)).toEqual([]); });
  it('clips for a planned source whose own day is ahead', () => {
    const q = quickPicks({ kind: 'plan', day: '2026-11-16' }, today);
    expect(q.find(p => p.id === 'next7')!.days).not.toContain('2026-11-16');
    expect(q.find(p => p.id === 'next7')!.days).toHaveLength(6);
  });
});

describe('dayNames (shared with the Nutrition board)', () => {
  it('names a day, marks today, and finds the Sunday of its week', () => {
    expect(dayLabel('2026-11-14', today)).toBe('Sat 14 · today');
    expect(dayLabel('2026-11-15', today)).toBe('Sun 15');
    expect(sundayOf('2026-11-14')).toBe('2026-11-08');
    expect(sundayOf('2026-11-08')).toBe('2026-11-08');
  });
});

describe('resultText', () => {
  it('names the count and the skipped days with why', () => {
    expect(resultText('Copied', ['a', 'b', 'c', 'd', 'e'], [{ day: '2026-11-17', reason: 'full' }])).toBe('Copied to 5 days. Skipped Tue 17: full.');
    expect(resultText('Copied', ['2026-11-15'], [])).toBe('Copied to Sun 15.');
    expect(resultText('Moved', ['2026-11-15'], [])).toBe('Moved to Sun 15.');
    expect(resultText('Copied', [], [{ day: '2026-11-17', reason: 'full' }, { day: '2026-11-18', reason: 'already there' }])).toBe('Nothing copied. Skipped Tue 17: full, Wed 18: already there.');
  });
});

describe('moveButton', () => {
  const lab = (m: string) => m[0]!.toUpperCase() + m.slice(1);
  it('a day, a day with a new meal, a meal alone, and nothing', () => {
    expect(moveButton(['2026-11-15'], 'lunch', 'lunch', lab)).toEqual({ label: 'Move to Sun 15', enabled: true });
    expect(moveButton(['2026-11-15'], 'dinner', 'lunch', lab)).toEqual({ label: 'Move to Sun 15, Dinner', enabled: true });
    expect(moveButton([], 'dinner', 'lunch', lab)).toEqual({ label: 'Move to Dinner', enabled: true });
    expect(moveButton([], 'lunch', 'lunch', lab)).toEqual({ label: 'Pick a day', enabled: false });
    expect(moveButton([], undefined, undefined, lab).enabled).toBe(false);
  });
});

describe('goLabel, onwardDays, plannedText (the Add sheet and the buttons)', () => {
  it('words the button for none, one and several days', () => {
    expect(goLabel('Copy', [])).toBe('Pick a day');
    expect(goLabel('Move', ['2026-11-15'])).toBe('Move to Sun 15');
    expect(goLabel('Copy', ['2026-11-15', '2026-11-16'])).toBe('Copy to 2 days');
  });
  it('"This day on" runs from the day for 14 days, cut at the last plannable day', () => {
    const d = onwardDays('2026-11-20', today);
    expect(d[0]).toBe('2026-11-20');
    expect(d.at(-1)).toBe('2026-12-03');
    expect(d).toHaveLength(14);
    expect(onwardDays(today, today)).toHaveLength(14);
    expect(onwardDays('2027-11-10', today)).toEqual(['2027-11-10', '2027-11-11', '2027-11-12', '2027-11-13']); // cut at today + 364
    expect(onwardDays('2020-01-01', today)[0]).toBe(today);
    expect(onwardDays('2027-11-14', today)).toEqual([]);
  });
  it('says what was planned and what was skipped', () => {
    expect(plannedText('Soup', 'Lunch', ['2026-11-15', '2026-11-16'], [{ day: '2026-11-17', reason: 'full' }])).toBe('Planned Soup for Lunch on 2 days. Skipped Tue 17: full.');
    expect(plannedText('Soup', 'Lunch', ['2026-11-15'], [])).toBe('Planned Soup for Lunch on Sun 15.');
    expect(plannedText('Soup', 'Lunch', ['2026-11-15', '2026-11-16'], [{ day: '2026-11-17', reason: 'full' }], ' It waits.')).toBe('Planned Soup for Lunch on 2 days. It waits. Skipped Tue 17: full.'); // a note goes before the skipped days
    expect(plannedText('Soup', 'Lunch', [], [{ day: '2026-11-17', reason: 'full' }])).toBe('Nothing planned. Skipped Tue 17: full.');
  });
});
