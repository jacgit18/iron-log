import { describe, expect, it } from 'vitest';
import { DEFAULT_CFG } from './logic.js';
import { MAX_EXERCISE_NAME, newExerciseError, startName } from './shareExercise.js';

const cfg = { ...structuredClone(DEFAULT_CFG), ex: { mine: { n: 'My Row' } } } as never;

describe('startName', () => {
  it('puts the shared title on one line and cuts it to the name limit', () => {
    expect(startName('  Leg \n day  ')).toBe('Leg day');
    expect(startName('x'.repeat(200))).toHaveLength(MAX_EXERCISE_NAME);
    expect(startName('')).toBe('');
  });
});

describe('newExerciseError', () => {
  it('accepts a new name', () => expect(newExerciseError(cfg, 'Cable Lateral Raise', [])).toBeNull());
  it('refuses an empty name, an over-long one, and one already in the library (any case or spacing)', () => {
    expect(newExerciseError(cfg, '   ', [])).toBe('Give the exercise a name.');
    expect(newExerciseError(cfg, 'x'.repeat(MAX_EXERCISE_NAME + 1), [])).toMatch(/80 characters/);
    expect(newExerciseError(cfg, ' my  row ', [])).toBe('That exercise is already in the library.');
  });
});
