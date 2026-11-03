import { describe, it, expect } from 'vitest';
import { kgText } from './weightUnit.js';

describe('kgText', () => {
  it('converts pounds to kg to 0.1', () => {
    expect(kgText(135)).toBe('61.2 kg');
    expect(kgText('135')).toBe('61.2 kg');
    expect(kgText(2.5)).toBe('1.1 kg');
  });
  it('drops a trailing .0', () => {
    expect(kgText(220.462)).toBe('100 kg');
  });
  it('shows nothing for empty, zero, negative or non-numbers', () => {
    ['', null, undefined, 0, -5, 'abc', NaN, Infinity].forEach(v => expect(kgText(v)).toBe(''));
  });
});
