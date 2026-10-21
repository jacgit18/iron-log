import { describe, expect, it } from 'vitest';
import { REFUSED_PAYLOAD_MAX, refusedPayload } from './support.ts';

// Code audit S-03 and S-04: what refused_writes keeps of an invalid write.
describe('refusedPayload', () => {
  it('keeps a small payload whole, without the typed note', () => {
    expect(JSON.parse(refusedPayload({ weekStart: 'bad', entry: { w: 100, n: 'a private note' } }))).toEqual({ weekStart: 'bad', entry: { w: 100 } });
  });

  it('keeps only the start of a big one, as valid JSON that says how big it was', () => {
    const out = refusedPayload({ weekStart: 'bad', junk: 'x'.repeat(90_000) });
    expect(out.length).toBeLessThanOrEqual(REFUSED_PAYLOAD_MAX);
    const parsed = JSON.parse(out) as { truncated: boolean; size: number; head: string };
    expect(parsed.truncated).toBe(true);
    expect(parsed.size).toBeGreaterThan(90_000);
    expect(parsed.head.startsWith('{"weekStart":"bad"')).toBe(true);
  });

  it('replaces a NUL byte, which jsonb cannot hold and which made the insert itself fail', () => {
    const out = refusedPayload({ id: 'a\u0000b', 'k\u0000': 1 });
    expect(out).not.toMatch(/\\u0000/);
    expect(JSON.parse(out)).toEqual({ id: 'a\ufffdb', 'k\ufffd': 1 });
  });

  it('does not cut an emoji in half when it shortens a long payload', () => {
    for (let pad = 0; pad < 2; pad++) {
      const out = refusedPayload({ weekStart: 'x'.repeat(pad) + '\u{1F600}'.repeat(2000) });
      expect(out.length).toBeLessThanOrEqual(REFUSED_PAYLOAD_MAX + 50);
      expect(() => JSON.parse(out)).not.toThrow();
      expect(JSON.parse(out).head).not.toMatch(/[\ud800-\udbff]$/);
    }
  });

  it('copes with a payload that is not an object', () => {
    for (const v of [null, undefined, 5, 'x', []]) expect(() => JSON.parse(refusedPayload(v))).not.toThrow();
  });
});
