import { describe, expect, it } from 'vitest';
import { axisOf, commitDistance, followOffset, hintFor, startsOnControl, swipeCommits, MAX_FOLLOW } from './swipe.js';

describe('axisOf', () => {
  it('decides nothing for a tap wobble', () => expect(axisOf(4, 5)).toBe('none'));
  it('is x for clear horizontal travel, either way', () => { expect(axisOf(40, 5)).toBe('x'); expect(axisOf(-40, -10)).toBe('x'); });
  it('is y when movement is mostly vertical', () => { expect(axisOf(5, 40)).toBe('y'); expect(axisOf(30, 30)).toBe('y'); });
  it('stays undecided on a shallow diagonal', () => expect(axisOf(30, 25)).toBe('none'));
});

describe('swipeCommits', () => {
  it('needs 25% of a narrow card, never more than 90 px on a wide one', () => {
    expect(commitDistance(300)).toBe(75);
    expect(commitDistance(800)).toBe(90);
    expect(swipeCommits(80, 0, 300)).toBe(true);
    expect(swipeCommits(60, 0, 300)).toBe(false);
    expect(swipeCommits(90, 0, 800)).toBe(true);
    expect(swipeCommits(89, 0, 800)).toBe(false);
  });
  it('works left or right', () => { expect(swipeCommits(-100, 5, 340)).toBe(true); expect(swipeCommits(100, -5, 340)).toBe(true); });
  it('does not commit a mostly vertical or diagonal move, however long', () => {
    expect(swipeCommits(100, 120, 340)).toBe(false);
    expect(swipeCommits(100, 80, 340)).toBe(false);
  });
  it('does not commit a short swipe', () => expect(swipeCommits(30, 0, 340)).toBe(false));
});

describe('followOffset', () => {
  it('is 0 until horizontal, damped, and clamped', () => {
    expect(followOffset(3, 3)).toBe(0);
    expect(followOffset(10, 60)).toBe(0);
    expect(followOffset(100, 0)).toBeCloseTo(45);
    expect(followOffset(-1000, 0)).toBe(-MAX_FOLLOW);
  });
});

describe('hintFor', () => {
  it('says what a commit would do', () => { expect(hintFor(false)).toBe('Done'); expect(hintFor(true)).toBe('Undo'); });
});

describe('startsOnControl', () => {
  // No DOM in the unit tests: a stand-in whose closest() answers like the browser's for a given tag.
  const el = (tag: string) => ({ closest: (sel: string) => (sel.split(',').includes(tag) ? {} : null) }) as unknown as Element;
  it('ignores a touch that starts on a control', () => {
    for (const t of ['button', 'select', 'input', 'a', 'label', 'textarea']) expect(startsOnControl(el(t))).toBe(true);
  });
  it('allows the card body', () => expect(startsOnControl(el('p'))).toBe(false));
  it('ignores a missing target', () => expect(startsOnControl(null)).toBe(true));
});
