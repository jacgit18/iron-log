import { describe, expect, it } from 'vitest';
import { columnsClass } from './groceryColumns.js';

describe('columnsClass', () => {
  it('never asks for more columns than there are store sections', () => {
    expect(columnsClass(1)).toBe('gcols1');
    expect(columnsClass(2)).toBe('gcols2');
    expect(columnsClass(3)).toBe('gcols3');
  });
  it('caps at three, and treats nothing or nonsense as one', () => {
    expect(columnsClass(4)).toBe('gcols3');
    expect(columnsClass(40)).toBe('gcols3');
    expect(columnsClass(0)).toBe('gcols1');
    expect(columnsClass(-2)).toBe('gcols1');
    expect(columnsClass(Number.NaN)).toBe('gcols1');
  });
});
