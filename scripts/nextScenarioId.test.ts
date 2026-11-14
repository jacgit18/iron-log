import { describe, expect, it } from 'vitest';
import { nextScenarioId } from './next-scenario-id.mjs';

describe('nextScenarioId', () => {
  it('is one past the highest number, whatever order the names come in', () => {
    expect(nextScenarioId(['S-01.ts', 'S-300.ts', 'S-99.ts'])).toBe('S-301');
  });

  it('counts a gap as taken rather than filling it (ids are never reused)', () => {
    expect(nextScenarioId(['S-01.ts', 'S-03.ts'])).toBe('S-04');
  });

  it('starts at S-01 for an empty folder and pads to two digits', () => {
    expect(nextScenarioId([])).toBe('S-01');
    expect(nextScenarioId(['S-07.ts'])).toBe('S-08');
  });

  it('reads bare ids as well as file names and ignores anything else', () => {
    expect(nextScenarioId(['S-12', 'notes.md', 'index.ts', 'S-x.ts', ''])).toBe('S-13');
  });
});
