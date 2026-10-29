import { describe, expect, it } from 'vitest';
import { mask } from './scrub.ts';

describe('mask', () => {
  it('masks an email address, a token and digits', () => {
    expect(mask('mail jo.doe+x@example.co.uk now', 200)).toBe('mail [email] now');
    expect(mask(`bad ${'a'.repeat(40)} 42`, 200)).toBe('bad [secret] ##');
  });
  it('is fast on a long run of address characters with no @ (CodeQL js/polynomial-redos)', () => {
    const t = Date.now();
    mask(`${'a.'.repeat(50_000)}`, 300);
    mask(`${'a'.repeat(100_000)}@${'b'.repeat(100_000)}`, 300);
    expect(Date.now() - t).toBeLessThan(1500);
  });
});
