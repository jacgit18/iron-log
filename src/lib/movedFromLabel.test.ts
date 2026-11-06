import { describe, it, expect } from 'vitest';
import { colOf } from './logic.js';
import { movedFromLabel } from './movedFromLabel.js';

describe('movedFromLabel', () => {
  it('names the home column while it is on the board', () => {
    expect(movedFromLabel(1, 1)).toBe('From Day 1');
    expect(movedFromLabel(7, 6)).toBe('From Day 7'); // the column counts, not the program day
  });

  it('names the program day once rest days push the workout off the board', () => {
    const week = { rest: [1, 4] }; // workouts 6 and 7 land in columns 8 and 9
    expect(colOf(week, 6)).toBe(8);
    expect(colOf(week, 7)).toBe(9);
    expect(movedFromLabel(colOf(week, 7), 7)).toBe('From Day 7’s workout, off this week');
    expect(movedFromLabel(colOf(week, 6), 6)).toBe('From Day 6’s workout, off this week');
  });
});
