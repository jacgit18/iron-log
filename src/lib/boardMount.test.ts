import { describe, expect, it } from 'vitest';
import { isDayMounted, nextDayToMount } from './boardMount.js';

describe('nextDayToMount', () => {
  it('starts with the day next to the selected one, the earlier day winning a tie', () => {
    expect(nextDayToMount(4, new Set([4]), 7)).toBe(3);
    expect(nextDayToMount(1, new Set([1]), 7)).toBe(2);
    expect(nextDayToMount(7, new Set([7]), 7)).toBe(6);
  });

  it('walks outward until every day has been drawn, then stops', () => {
    const done = new Set([3]);
    const order: number[] = [];
    for (let d = nextDayToMount(3, done, 7); d !== null; d = nextDayToMount(3, done, 7)) { order.push(d); done.add(d); }
    expect(order).toEqual([2, 1, 4, 5, 6, 7].sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3) || a - b));
    expect(order).toHaveLength(6);
    expect(nextDayToMount(3, done, 7)).toBeNull();
  });

  it('treats no selected day as day 1', () => {
    expect(nextDayToMount(null, new Set(), 7)).toBe(1);
  });

  it('skips days that already drew, wherever they are', () => {
    expect(nextDayToMount(4, new Set([4, 3, 5]), 7)).toBe(2);
  });
});

describe('isDayMounted', () => {
  it('draws the selected day at once, even before anything is recorded', () => {
    expect(isDayMounted(5, 5, new Set(), false)).toBe(true);
  });

  it('keeps the other days empty on a phone until they have drawn', () => {
    expect(isDayMounted(2, 5, new Set([5]), false)).toBe(false);
    expect(isDayMounted(2, 5, new Set([5, 2]), false)).toBe(true);
  });

  it('draws every day on a wide screen', () => {
    for (let d = 1; d <= 7; d++) expect(isDayMounted(d, 1, new Set(), true)).toBe(true);
  });

  it('keeps a day drawn after the selection moves away', () => {
    expect(isDayMounted(5, 2, new Set([2, 5]), false)).toBe(true);
  });
});
