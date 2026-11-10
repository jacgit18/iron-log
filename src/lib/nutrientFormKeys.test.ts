import { describe, expect, it } from 'vitest';
import { NUTRIENT_KEYS } from '../shared/nutrientKeys.js';
import { FORM_KEYS } from './nutrientFormKeys.js';

// Brief supplement-more-nutrients, PR 1: the pickers keep the first 20 keys, in data order, until the grouped pickers ship.
describe('FORM_KEYS', () => {
  it('is the first 20 keys of the data list order, with none of the eight added nutrients', () => {
    const added = ['thiamin', 'riboflavin', 'biotin', 'pantothenicAcid', 'choline', 'chromium', 'molybdenum', 'manganese'];
    expect(FORM_KEYS).toHaveLength(20);
    expect(FORM_KEYS.filter(k => added.includes(k))).toEqual([]);
    expect(NUTRIENT_KEYS.filter(k => FORM_KEYS.includes(k))).toEqual([...FORM_KEYS]);
  });
});
