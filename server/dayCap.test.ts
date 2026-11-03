import { describe, expect, it } from 'vitest';
import { dayCap } from './dayCap.ts';

describe('dayCap', () => {
  it('allows max uses per key, then refuses with the seconds left, and starts again after a day', () => {
    let t = 1_000;
    const cap = dayCap(() => t);
    expect(cap.take('a', 2)).toEqual({ ok: true });
    expect(cap.take('a', 2)).toEqual({ ok: true });
    t += 60_000;
    expect(cap.take('a', 2)).toEqual({ ok: false, retryAfterSec: 86_340 });
    expect(cap.take('b', 2)).toEqual({ ok: true }); // another key has its own count
    t += 24 * 60 * 60_000;
    expect(cap.take('a', 2)).toEqual({ ok: true });
  });
});
