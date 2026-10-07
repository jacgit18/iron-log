import { describe, expect, it } from 'vitest';
import { validateLogSession } from '../src/shared/commands.ts';
import { weekStartOf, ymd } from '../src/shared/dates.ts';
import { normEntry } from '../src/shared/validate.ts';

// A4: the API and the phone run the same shared code. This fails if server/ can no longer import it.
describe('shared code from server/', () => {
  it('validates a log-session input', () => {
    expect(validateLogSession({ exerciseId: 'squat', entry: { d: '2026-10-07' } })?.entry).toEqual(normEntry({ d: '2026-10-07' }));
  });
  it('finds the Sunday that starts the week', () => {
    expect(ymd(weekStartOf(new Date(2026, 9, 7)))).toBe('2026-10-04');
  });
});
