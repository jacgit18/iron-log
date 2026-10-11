import { describe, it, expect } from 'vitest';
import { dropIndex, shiftOf } from './useDragReorder.ts';

// Rows whose middles sit at 50, 150, 250, 350 (100 px tall).
const mids = [50, 150, 250, 350];

describe('dropIndex', () => {
  it('stays put until the dragged row passes a neighbour’s middle', () => {
    expect(dropIndex(mids, 1, 150)).toBe(1);
    expect(dropIndex(mids, 1, 249)).toBe(1);
    expect(dropIndex(mids, 1, 251)).toBe(2);
    expect(dropIndex(mids, 1, 49)).toBe(0);
  });
  it('clamps to the ends of the list', () => {
    expect(dropIndex(mids, 0, 9999)).toBe(3);
    expect(dropIndex(mids, 3, -9999)).toBe(0);
  });
});

describe('shiftOf', () => {
  it('slides the rows between the start and the drop by one row, toward the gap', () => {
    const down = { from: 1, to: 3, dy: 200, size: 90 };
    expect([0, 1, 2, 3, 4].map(i => shiftOf(down, i))).toEqual([0, 0, -90, -90, 0]);
    const up = { from: 3, to: 1, dy: -200, size: 90 };
    expect([0, 1, 2, 3, 4].map(i => shiftOf(up, i))).toEqual([0, 90, 90, 0, 0]);
    expect(shiftOf(null, 2)).toBe(0);
  });
});
