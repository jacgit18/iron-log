import { describe, it, expect } from 'vitest';
import { dropIndex, edgeSpeed, shiftOf } from './useDragReorder.ts';

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

describe('edgeSpeed', () => {
  it('does not scroll in the middle of the window', () => {
    expect([200, 400, 720].map(y => edgeSpeed(y, 800))).toEqual([0, 0, 0]);
  });
  it('scrolls up near the top and down near the bottom', () => {
    expect(edgeSpeed(10, 800)).toBeLessThan(0);
    expect(edgeSpeed(790, 800)).toBeGreaterThan(0);
  });
  it('is faster the nearer the edge, from a slow start to a cap', () => {
    expect(edgeSpeed(79, 800)).toBeCloseTo(-159.4, 1); // one pixel into the zone: just over the slow speed
    expect(edgeSpeed(80, 800)).toBe(0);
    expect(Math.abs(edgeSpeed(40, 800))).toBeGreaterThan(Math.abs(edgeSpeed(70, 800)));
    expect(edgeSpeed(0, 800)).toBe(-900);
    expect(edgeSpeed(-300, 800)).toBe(-900); // a finger dragged past the screen edge
    expect(edgeSpeed(1200, 800)).toBe(900);
  });
});
