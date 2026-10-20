import { describe, expect, it } from 'vitest';
import { pickView } from './pickView.js';

describe('pickView', () => {
  const all = ['grocery', 'supplements', 'medical', 'recipes'];
  it('keeps the saved view while it is offered', () => {
    expect(pickView(all, 'recipes')).toBe('recipes');
    expect(pickView(all, 'grocery')).toBe('grocery');
  });
  it('falls back to Nutrition when the saved view is no longer offered, for example Recipes after admin turns off mid-session', () => {
    expect(pickView(['grocery', 'supplements'], 'recipes')).toBe('supplements');
    expect(pickView(['grocery', 'supplements'], 'medical')).toBe('supplements');
    expect(pickView(['grocery', 'supplements'], 'nonsense')).toBe('supplements');
  });
  it('falls back to the first section when Nutrition is not there either', () => {
    expect(pickView(['grocery'], 'recipes')).toBe('grocery');
  });
});
