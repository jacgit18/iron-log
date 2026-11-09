import { describe, expect, it } from 'vitest';
import { duplicateRowNotes } from './nutrientRowIssues.js';

describe('duplicateRowNotes', () => {
  it('says a nutrient and unit listed twice keeps the first, once however many repeats', () => {
    const rows = [{ key: 'zinc', amount: '10', unit: 'mg' }, { key: 'zinc', amount: '5', unit: 'mg' }, { key: 'zinc', amount: '2', unit: 'mg' }] as const;
    expect(duplicateRowNotes([...rows])).toEqual(['Zinc in mg is listed twice; only the first is kept.']);
  });
  it('is quiet for the same nutrient in another unit, for rows with no amount, and for a new blank row', () => {
    expect(duplicateRowNotes([{ key: 'vitaminD', amount: '10', unit: 'mcg' }, { key: 'vitaminD', amount: '400', unit: 'IU' }])).toEqual([]);
    expect(duplicateRowNotes([{ key: 'zinc', amount: '10', unit: 'mg' }, { key: 'zinc', amount: '', unit: 'mg' }])).toEqual([]);
    expect(duplicateRowNotes([])).toEqual([]);
  });
});
