import { describe, expect, it } from 'vitest';
import { backoffMs } from './backoff.js';
import { parseRetryAfter } from './transport.js';

describe('parseRetryAfter', () => {
  it('reads seconds and dates, caps the wait, and ignores nonsense', () => {
    expect(parseRetryAfter('7')).toBe(7000);
    expect(parseRetryAfter('0')).toBe(0);
    expect(parseRetryAfter('99999')).toBe(5 * 60_000);
    expect(parseRetryAfter(new Date(10_000 + 30_000).toUTCString(), 10_000)).toBeGreaterThanOrEqual(29_000);
    expect(parseRetryAfter(new Date(0).toUTCString(), 10_000)).toBe(0);
    expect(parseRetryAfter('soon')).toBeNull();
    expect(parseRetryAfter('-5')).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });
});

describe('backoffMs', () => {
  const mid = () => 0.5; // exactly 100%
  it('starts at 1.5 s and doubles up to a minute', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(a => backoffMs(a, null, mid))).toEqual([1500, 3000, 6000, 12000, 24000, 48000, 60000, 60000]);
  });
  it('spreads each wait over 80% to 120%', () => {
    expect(backoffMs(2, null, () => 0)).toBe(4800);
    expect(backoffMs(2, null, () => 0.999999)).toBe(7200);
  });
  it('obeys a server that says how long to wait', () => {
    expect(backoffMs(5, 12_000)).toBe(12_000);
    expect(backoffMs(0, 0)).toBe(0);
  });
  it('treats a negative attempt as the first', () => {
    expect(backoffMs(-3, null, mid)).toBe(1500);
  });
});
