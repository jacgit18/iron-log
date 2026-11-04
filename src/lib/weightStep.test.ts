import { describe, it, expect } from 'vitest';
import { STEP_CHIPS, parseStep, stepText } from './weightStep.js';

describe('weight step input', () => {
  it('empty means not set, a good number is the step', () => {
    expect(parseStep('')).toEqual({ ok: true, step: null });
    expect(parseStep('  ')).toEqual({ ok: true, step: null });
    expect(parseStep('10')).toEqual({ ok: true, step: 10 });
    expect(parseStep('2.5')).toEqual({ ok: true, step: 2.5 });
    expect(parseStep('7,5')).toEqual({ ok: true, step: 7.5 });
    expect(parseStep(' 50 ')).toEqual({ ok: true, step: 50 });
  });
  it('refuses zero, negatives, text, more than 50 and anything not on a half pound', () => {
    ['0', '-5', 'abc', '51', '2.3', '1e1', '0x5', 'Infinity', '5 lb', '.'].forEach(t => expect(parseStep(t)).toEqual({ ok: false }));
  });
  it('every chip is itself a good step', () => {
    STEP_CHIPS.forEach(n => expect(parseStep(String(n))).toEqual({ ok: true, step: n }));
  });
  it('shows a saved step, and nothing for a missing or unusable one', () => {
    expect(stepText(10)).toBe('10');
    expect(stepText(2.5)).toBe('2.5');
    expect(stepText(undefined)).toBe('');
    expect(stepText(0)).toBe('');
    expect(stepText(NaN)).toBe('');
  });
});
