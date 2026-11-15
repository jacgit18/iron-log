import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dayToShow, getPickedDay, setPickedDay, subscribePickedDay } from './nutritionDayPick.js';

const TODAY = '2026-11-08';

beforeEach(() => setPickedDay(null));

describe('the picked Nutrition day, kept for the visit', () => {
  it('starts with nothing kept: today shows', () => {
    expect(getPickedDay()).toBeNull();
    expect(dayToShow(getPickedDay(), TODAY)).toBe(TODAY);
  });
  it('keeps the day that was picked, so coming back from Recipes shows it', () => {
    setPickedDay('2026-11-10');
    expect(dayToShow(getPickedDay(), TODAY)).toBe('2026-11-10');
  });
  it('a kept day that is no longer on the board falls back to today', () => {
    setPickedDay('2026-09-01');
    expect(dayToShow(getPickedDay(), TODAY)).toBe(TODAY);
  });
  it('tells subscribers once per change and stops after unsubscribing', () => {
    const f = vi.fn();
    const off = subscribePickedDay(f);
    setPickedDay('2026-11-09'); setPickedDay('2026-11-09');
    expect(f).toHaveBeenCalledTimes(1);
    off(); setPickedDay('2026-11-10');
    expect(f).toHaveBeenCalledTimes(1);
  });
});
