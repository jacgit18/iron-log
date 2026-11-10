import { describe, expect, it } from 'vitest';
import { NUTRIENT_KEYS, type NutrientKey } from '../shared/nutrientKeys.js';
import { PICKER_GROUPS, nextFreePickerKey } from './nutrientPickerGroups.js';

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

describe('nextFreePickerKey', () => {
  it('follows the picker order, skips taken keys and ends with none', () => {
    expect(nextFreePickerKey([])).toBe('thiamin');
    expect(nextFreePickerKey(['thiamin', 'riboflavin'])).toBe('niacin');
    expect(nextFreePickerKey(NUTRIENT_KEYS.filter(k => k !== 'choline'))).toBe('choline');
    expect(nextFreePickerKey(NUTRIENT_KEYS)).toBeUndefined();
  });
});
