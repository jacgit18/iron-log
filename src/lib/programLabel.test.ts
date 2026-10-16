import { describe, expect, it } from 'vitest';
import { programLabel } from './programLabel.js';
import type { Cfg } from '../types.ts';

const cfg = (progNames?: Record<string, string>) => ({ progNames }) as unknown as Cfg;

describe('programLabel', () => {
  it('keeps the default name, which already holds the letter', () => {
    expect(programLabel(cfg(), 'A')).toBe('Program A');
    expect(programLabel(cfg(), 'B')).toBe('Program B');
  });
  it('puts the letter in front of a renamed program, so the visible A or B is in the name', () => {
    expect(programLabel(cfg({ A: 'Upper', B: 'Lower' }), 'A')).toBe('A: Upper');
    expect(programLabel(cfg({ A: 'Upper', B: 'Lower' }), 'B')).toBe('B: Lower');
  });
  it('leaves a custom name that holds the letter alone', () => {
    expect(programLabel(cfg({ A: 'Abs and arms' }), 'A')).toBe('Abs and arms');
  });
});
