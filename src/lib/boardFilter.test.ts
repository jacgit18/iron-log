import { describe, it, expect } from 'vitest';
import { boardFilterCount, boardFilterSummary } from './boardFilter.js';

describe('boardFilterCount', () => {
  it('counts the filters that are on', () => {
    expect(boardFilterCount({ muscle: '', eq: '' })).toBe(0);
    expect(boardFilterCount({ muscle: 'chest', eq: '' })).toBe(1);
    expect(boardFilterCount({ muscle: '', eq: 'barbell' })).toBe(1);
    expect(boardFilterCount({ muscle: 'chest', eq: 'barbell' })).toBe(2);
  });
});

describe('boardFilterSummary', () => {
  it('names each filter that is on, and is empty with none', () => {
    expect(boardFilterSummary('', '')).toBe('');
    expect(boardFilterSummary('Chest', '')).toBe('Chest first');
    expect(boardFilterSummary('', 'Barbell')).toBe('Barbell');
    expect(boardFilterSummary('Chest', 'Barbell')).toBe('Chest first · Barbell');
  });
});
