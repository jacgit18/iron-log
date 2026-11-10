import { describe, expect, it } from 'vitest';
import { NUTRIENT_KEYS, type NutrientKey } from '../shared/nutrientKeys.js';
import { PICKER_GROUPS, pickerGroups } from './nutrientPickerGroups.js';

describe('PICKER_GROUPS', () => {
  it('lists every nutrient key under exactly one heading', () => {
    const all = PICKER_GROUPS.flatMap(g => g.keys);
    expect(all).toHaveLength(NUTRIENT_KEYS.length);
    expect([...all].sort()).toEqual([...NUTRIENT_KEYS].sort());
  });
  it('uses the three headings in order, none empty', () => {
    expect(PICKER_GROUPS.map(g => g.heading)).toEqual(['Vitamins', 'Minerals', 'Other']);
    expect(PICKER_GROUPS.every(g => g.keys.length > 0)).toBe(true);
  });
  it('puts the eight added nutrients under the right headings', () => {
    const of = (k: NutrientKey) => PICKER_GROUPS.find(g => g.keys.includes(k))?.heading;
    expect(['thiamin', 'riboflavin', 'biotin', 'pantothenicAcid'].map(k => of(k as NutrientKey))).toEqual(Array(4).fill('Vitamins'));
    expect(['chromium', 'manganese', 'molybdenum'].map(k => of(k as NutrientKey))).toEqual(Array(3).fill('Minerals'));
    expect(of('choline')).toBe('Other');
  });
});

describe('pickerGroups', () => {
  it('returns the table for a known or missing key', () => {
    expect(pickerGroups()).toBe(PICKER_GROUPS);
    expect(pickerGroups('zinc')).toBe(PICKER_GROUPS);
  });
  it('keeps an unknown current key selectable', () => {
    const g = pickerGroups('mystery' as NutrientKey);
    expect(g[g.length - 1]).toEqual({ heading: 'Current', keys: ['mystery'] });
  });
});
