import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mask } from './scrub.ts';

describe('mask', () => {
  it('masks an email address, a token and digits', () => {
    expect(mask('mail jo.doe+x@example.co.uk now', 200)).toBe('mail [email] now');
    expect(mask(`bad ${'a'.repeat(40)} 42`, 200)).toBe('bad [secret] ##');
  });
  it('masks an address whole however long its parts are', () => {
    expect(mask(`${'x'.repeat(70)}jo@ex.com`, 200)).toBe('[email]');
    expect(mask(`a@${'b'.repeat(80)}.com`, 200)).toBe('[email]');
  });
  it('is fast on a long run of address characters with no @ (CodeQL js/polynomial-redos)', () => {
    const t = Date.now();
    mask(`${'a.'.repeat(50_000)}`, 300);
    mask(`${'a'.repeat(100_000)}@${'b'.repeat(100_000)}`, 300);
    mask('a@'.repeat(50_000), 300);
    expect(Date.now() - t).toBeLessThan(1500);
  });
});

describe('the optional profile (brief recommendations-by-age-sex)', () => {
  it('never reaches an error report: a birth year is masked, and the report route reads only its own fields, never the config', () => {
    expect(mask('profile {"birthYear":1985}', 200)).toBe('profile {"birthYear":####}');
    expect(readFileSync(new URL('./clientErrors.ts', import.meta.url), 'utf8')).not.toMatch(/\bprofile\b|\bbirthYear\b|\bcfg\b/);
  });
});
