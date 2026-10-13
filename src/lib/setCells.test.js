import { describe, it, expect, vi } from 'vitest';
import { advanceOnEnter, cellHint, selectOnFocus } from './setCells.ts';

const cells = n => Array.from({ length: n }, () => ({ focus: vi.fn() }));
// An Enter keydown on box `i` of `all` (the set table's boxes); `over` changes the event.
const key = (all, i, over = {}) => {
  const box = Object.assign(all[i], { closest: () => ({ querySelectorAll: () => all }) });
  return { key: 'Enter', shiftKey: false, nativeEvent: { isComposing: false }, preventDefault: vi.fn(), currentTarget: box, ...over };
};

describe('advanceOnEnter', () => {
  it('moves to the next box and stops the form from submitting', () => {
    const all = cells(4), e = key(all, 1);
    expect(advanceOnEnter(e)).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(all[2].focus).toHaveBeenCalled();
  });
  it('walks weight, reps, then the next set\'s weight', () => {
    const all = cells(4);
    advanceOnEnter(key(all, 0)); advanceOnEnter(key(all, 1)); // set 1 weight -> reps -> set 2 weight
    expect(all[1].focus).toHaveBeenCalled();
    expect(all[2].focus).toHaveBeenCalled();
  });
  it('lets Enter in the last box submit the form', () => {
    const all = cells(4), e = key(all, 3);
    expect(advanceOnEnter(e)).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
  it('ignores other keys, Shift+Enter and an input method still composing', () => {
    const all = cells(3);
    for (const over of [{ key: 'a' }, { shiftKey: true }, { nativeEvent: { isComposing: true } }]) {
      expect(advanceOnEnter(key(all, 0, over))).toBe(false);
    }
    expect(all[1].focus).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('labels the Enter key Next except on the last box', () => {
    expect([cellHint(false), cellHint(true)]).toEqual(['next', 'done']);
  });
  it('selects the box contents on focus', () => {
    const select = vi.fn();
    selectOnFocus({ currentTarget: { select } });
    expect(select).toHaveBeenCalled();
  });
});
