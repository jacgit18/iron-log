import { describe, it, expect } from 'vitest';
import { canReorder, groupHeading, groupOpen, isFiltering, resultText } from './libraryFilter.js';

describe('isFiltering', () => {
  it('is off with no filter and with spaces only, on for a search or any chip', () => {
    expect(isFiltering({})).toBe(false);
    expect(isFiltering({ q: '  ', eq: '', muscle: '', src: '' })).toBe(false);
    expect(isFiltering({ q: 'row' })).toBe(true);
    expect(isFiltering({ eq: 'cable' })).toBe(true);
    expect(isFiltering({ muscle: 'quads' })).toBe(true);
    expect(isFiltering({ src: 'custom' })).toBe(true);
  });
});
describe('resultText', () => {
  it('shows the total, or n of total while filtering', () => {
    expect(resultText(12, 12, false, 'exercises')).toBe('12 exercises');
    expect(resultText(3, 12, true, 'stretches')).toBe('3 of 12 stretches');
    expect(resultText(0, 12, true, 'exercises')).toBe('0 of 12 exercises');
  });
});
describe('groupOpen', () => {
  it('opens Every day first and the others closed', () => {
    expect(groupOpen('primary', {}, false)).toBe(true);
    expect(groupOpen('secondary', {}, false)).toBe(false);
    expect(groupOpen('', {}, false)).toBe(false);
  });
  it('follows what the person opened or closed', () => {
    expect(groupOpen('secondary', { secondary: true }, false)).toBe(true);
    expect(groupOpen('primary', { primary: false }, false)).toBe(false);
  });
  it('opens every group while searching, even one the person closed', () => {
    expect(groupOpen('', {}, true)).toBe(true);
    expect(groupOpen('primary', { primary: false }, true)).toBe(true);
  });
});
describe('groupHeading and canReorder', () => {
  it('names the group with its count', () => { expect(groupHeading('Every day', 6)).toBe('Every day · 6'); });
  it('allows reordering only on the full list', () => { expect(canReorder(false)).toBe(true); expect(canReorder(true)).toBe(false); });
});
