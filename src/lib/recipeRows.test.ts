import { describe, expect, it } from 'vitest';
import type { Recipe } from '../types.ts';
import { loggableRecipe } from './recipeRows.js';

const base: Recipe = { id: 'a', n: 'Chili', cat: 'protein', ing: [{ n: 'beans' }], steps: ['Cook.'] };

describe('loggableRecipe', () => {
  it('is true with calories and protein, for something you eat', () => expect(loggableRecipe({ ...base, kcal: 450, p: 35 })).toBe(true));
  it('is false without numbers to log', () => { expect(loggableRecipe(base)).toBe(false); expect(loggableRecipe({ ...base, kcal: 450 })).toBe(false); });
  it('is false for an ingredient only, even with numbers', () => expect(loggableRecipe({ ...base, kcal: 40, p: 1, uses: ['ingredient'] })).toBe(false));
});
