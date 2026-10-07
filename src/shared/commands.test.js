import { describe, it, expect } from 'vitest';
import { validateLogSession } from './commands.js';

describe('validateLogSession', () => {
  it('accepts an exercise id with a valid entry and cleans the entry', () => {
    const out = validateLogSession({ exerciseId: 'squat', entry: { d: '2026-10-07', w: '135', s: 3, junk: 1 } });
    expect(out).toEqual({ exerciseId: 'squat', entry: { d: '2026-10-07', w: 135, s: 3 } });
  });
  it('refuses a missing or oversized exercise id', () => {
    expect(validateLogSession({ entry: { d: '2026-10-07' } })).toBeNull();
    expect(validateLogSession({ exerciseId: 'x'.repeat(101), entry: { d: '2026-10-07' } })).toBeNull();
  });
  it('refuses an entry with no valid date, and non-objects', () => {
    expect(validateLogSession({ exerciseId: 'squat', entry: { d: 'nope' } })).toBeNull();
    expect(validateLogSession(null)).toBeNull();
  });
});
