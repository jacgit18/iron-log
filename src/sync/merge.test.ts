import { describe, expect, it } from 'vitest';
import { normWeek } from '../shared/week.js';
import { tickedBeatsSkipped } from './merge.js';

const week = (over: object) => normWeek({ prog: 'A', ...over });

describe('tickedBeatsSkipped', () => {
  it('a card ticked on the other side is done, not skipped', () => {
    const out = tickedBeatsSkipped(week({ skipped: { x: true, y: true } }), week({ done: { x: true } }));
    expect(out.done).toEqual({ x: true });
    expect(out.skipped).toEqual({ y: true });
  });

  it('keeps everything else this device wrote, including a card it unticked that the other side still has', () => {
    const ours = week({ done: { a: true }, skipped: { x: true }, moved: { m: 3 } });
    const out = tickedBeatsSkipped(ours, week({ done: { x: true, b: true } }));
    expect(out.done).toEqual({ a: true, x: true }); // b is not added: this device wins
    expect(out.moved).toEqual({ m: 3 });
  });

  it('returns the same object when nothing changes', () => {
    const ours = week({ done: { a: true }, skipped: { y: true } });
    expect(tickedBeatsSkipped(ours, week({ done: { x: true } }))).toBe(ours);
    expect(tickedBeatsSkipped(ours, week({}))).toBe(ours);
  });

  it('does not change the week it was given', () => {
    const ours = week({ skipped: { x: true } });
    tickedBeatsSkipped(ours, week({ done: { x: true } }));
    expect(ours.skipped).toEqual({ x: true });
  });

  it('reads a week that is not clean', () => {
    expect(tickedBeatsSkipped({ skipped: { x: 1 } }, week({ done: { x: true } })).done).toEqual({ x: true });
  });
});
