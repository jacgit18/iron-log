import { describe, expect, it } from 'vitest';
import type { Recipe } from '../types.ts';
import { suggestedPartners } from './pairSuggestions.js';

const r = (id: string, extra: Partial<Recipe> = {}): Recipe => ({ id, n: id, cat: 'carbs', ing: [{ n: 'x' }], steps: ['Cook.'], ...extra });
const chili = r('chili', { pairs: ['rice', 'salsa', 'plain'] });
const list = [chili, r('rice', { kcal: 200, p: 4, pairs: ['chili'] }), r('salsa', { cat: 'sauces', kcal: 10, p: 0 }), r('plain')];

describe('suggestedPartners', () => {
  it('offers partners with numbers that can be eaten, not an Ingredient-only sauce or one with no numbers', () => {
    expect(suggestedPartners(chili, list).map(x => x.id)).toEqual(['rice']);
  });
  it('is empty for a recipe with no pairing', () => expect(suggestedPartners(list[3]!, list)).toEqual([]));
  it('finds a partner that only lists the recipe (an older copy wrote one side)', () => {
    const one = [r('rice', { kcal: 200, p: 4, pairs: ['chili'] }), r('chili')];
    expect(suggestedPartners(one[1]!, one).map(x => x.id)).toEqual(['rice']);
  });
});
