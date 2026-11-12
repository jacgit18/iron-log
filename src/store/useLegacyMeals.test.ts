import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// The store side of the saved-meals gate (brief saved-meals-removal): the selector the views' hook uses. The gate itself is tested in src/lib/quickMeals.test.ts.
let useAppStore: typeof import('./useAppStore.js').useAppStore;
let legacyOf: typeof import('./useLegacyMeals.js').legacyOf;
let useLegacyMeals: typeof import('./useLegacyMeals.js').useLegacyMeals;
const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); ({ legacyOf, useLegacyMeals } = await import('./useLegacyMeals.js')); await st().init(); });
beforeEach(() => { clearStorage(); st().mutateCfg(c => { delete c.diet; }); });

const meal = (id: string) => ({ id, n: id, items: [{ n: 'Oats', kcal: 300, p: 10 }] });

describe('legacyOf', () => {
  it('holds nothing when the diet settings have no saved meals', () => {
    expect(legacyOf(st())).toEqual({ held: [], moved: {} });
    expect(typeof useLegacyMeals).toBe('function');
  });
  it('holds exactly the saved meals with no recipe yet, and carries the moved record', () => {
    st().mutateCfg(c => { c.diet = { meals: [meal('a'), meal('b')], mealsMoved: { b: 'rb' } }; });
    const got = legacyOf(st());
    expect(got.held.map(m => m.id)).toEqual(['a']);
    expect(got.moved).toEqual({ b: 'rb' });
    expect(legacyOf(st())).toBe(got); // the same object while the diet settings are the same
  });
});
