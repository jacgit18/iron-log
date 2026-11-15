import { describe, expect, it } from 'vitest';
import type { SupplementItem } from '../types.ts';
import { dayTotal, MAX_TIME_PORTION, planTimes, stepTime, timesOf, toggleAddSlot, toggleTime } from './supplementTimes.js';

const fish = (id: string, slot: SupplementItem['slot'], portion?: number): SupplementItem => ({ id, n: 'Fish oil', slot, serving: { units: 1, form: 'Softgel' }, ...(portion ? { portion } : {}) });
const D3: SupplementItem = { id: 'd3', n: 'D3', slot: 'morning' };

describe('timesOf', () => {
  it('lists the scheduled entries of one product in time order', () => expect(timesOf([fish('b', 'night'), D3, fish('a', 'morning', 2)], 'b')).toEqual([{ slot: 'morning', portion: 2 }, { slot: 'night', portion: 1 }]));
  it('is empty for a library-only entry and an unknown id', () => { expect(timesOf([fish('a', '')], 'a')).toEqual([]); expect(timesOf([], 'x')).toEqual([]); });
});

describe('toggleTime and stepTime', () => {
  it('turns a time on at one serving, in order, and off again', () => {
    const on = toggleTime([{ slot: 'night', portion: 1 }], 'morning');
    expect(on).toEqual([{ slot: 'morning', portion: 1 }, { slot: 'night', portion: 1 }]);
    expect(toggleTime(on, 'night')).toEqual([{ slot: 'morning', portion: 1 }]);
  });
  it('keeps the last time on and ignores an unknown time', () => { const one = [{ slot: 'night' as const, portion: 1 }]; expect(toggleTime(one, 'night')).toBe(one); expect(toggleTime(one, '')).toBe(one); });
  it('steps one time only, from one step to the cap', () => {
    const t = [{ slot: 'morning' as const, portion: 1 }, { slot: 'night' as const, portion: 1 }];
    expect(stepTime(t, 'night', 1, 1)).toEqual([{ slot: 'morning', portion: 1 }, { slot: 'night', portion: 2 }]);
    expect(stepTime(t, 'night', -1, 1)[1].portion).toBe(1);
    expect(stepTime([{ slot: 'night', portion: MAX_TIME_PORTION }], 'night', 1, 1)[0].portion).toBe(MAX_TIME_PORTION);
  });
});

describe('dayTotal', () => {
  const s = { units: 1, form: 'Softgel' };
  it('adds the times up in the serving unit', () => expect(dayTotal([{ slot: 'morning', portion: 1 }, { slot: 'night', portion: 1 }], s)).toEqual({ main: '2 softgels a day', detail: 'Morning 1 · Night 1' }));
  it('says one without a plural and counts servings without a serving size', () => {
    expect(dayTotal([{ slot: 'noon', portion: 1 }], s).main).toBe('1 softgel a day');
    expect(dayTotal([{ slot: 'noon', portion: 1.5 }], undefined).main).toBe('1½ servings a day');
  });
  it('is empty with no time on', () => expect(dayTotal([], s)).toEqual({ main: '', detail: '' }));
});

describe('planTimes', () => {
  it('adds a copy for a new time and leaves the existing one alone', () => expect(planTimes([fish('a', 'morning')], 'a', [{ slot: 'morning', portion: 1 }, { slot: 'night', portion: 1 }])).toEqual({ move: [], add: [{ from: 'a', slot: 'night', portion: 1 }], set: [], remove: [] }));
  it('splits two softgels in the morning into one and one', () => expect(planTimes([fish('a', 'morning', 2)], 'a', [{ slot: 'morning', portion: 1 }, { slot: 'night', portion: 1 }])).toEqual({ move: [], add: [{ from: 'a', slot: 'night', portion: 1 }], set: [{ id: 'a', portion: 1 }], remove: [] }));
  it('removes an entry whose time is off', () => expect(planTimes([fish('a', 'morning'), fish('b', 'night')], 'a', [{ slot: 'night', portion: 1 }])).toEqual({ move: [], add: [], set: [], remove: ['a'] }));
  it('moves a library-only copy into the first new time', () => expect(planTimes([fish('a', '')], 'a', [{ slot: 'noon', portion: 2 }, { slot: 'night', portion: 1 }])).toEqual({ move: [{ id: 'a', slot: 'noon', portion: 2 }], add: [{ from: 'a', slot: 'night', portion: 1 }], set: [], remove: [] }));
  it('does nothing for no times or an unknown entry', () => { expect(planTimes([fish('a', 'morning')], 'a', [])).toBeNull(); expect(planTimes([], 'a', [{ slot: 'noon', portion: 1 }])).toBeNull(); });
  it('does not touch another supplement', () => expect(planTimes([D3, fish("a", "morning")], "a", [{ slot: "night", portion: 1 }])!.remove).toEqual(['a']));
});

describe('toggleAddSlot', () => {
  it('collects times in order and toggles them off', () => { expect(toggleAddSlot(toggleAddSlot([], 'night'), 'morning')).toEqual(['morning', 'night']); expect(toggleAddSlot(['morning', 'night'], 'night')).toEqual(['morning']); });
  it('makes Library only exclusive in both directions', () => { expect(toggleAddSlot(['morning'], '')).toEqual(['']); expect(toggleAddSlot([''], 'noon')).toEqual(['noon']); expect(toggleAddSlot([''], '')).toEqual([]); });
});
