import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_VIEW_STATE, getRecipesViewState, resetRecipesViewState, setRecipesViewState, showSavedRecipe, subscribeRecipesViewState } from './recipesViewState.js';

beforeEach(resetRecipesViewState);

describe('recipesViewState', () => {
  it('starts at the defaults', () => {
    expect(getRecipesViewState()).toEqual(INITIAL_VIEW_STATE);
  });
  it('keeps what was set, one field at a time, until reset', () => {
    setRecipesViewState('q', 'soup');
    setRecipesViewState('tab', 'meals');
    setRecipesViewState('tagSel', ['quick']);
    expect(getRecipesViewState()).toMatchObject({ q: 'soup', tab: 'meals', tagSel: ['quick'], src: 'all' });
    resetRecipesViewState();
    expect(getRecipesViewState()).toEqual(INITIAL_VIEW_STATE);
  });
  it('tells subscribers on a change, not on the same value, and stops after unsubscribe', () => {
    const fn = vi.fn();
    const off = subscribeRecipesViewState(fn);
    setRecipesViewState('canMake', true);
    setRecipesViewState('canMake', true);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    setRecipesViewState('canMake', false);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('showSavedRecipe opens the recipe under All and clears whatever could hide it', () => {
    setRecipesViewState('q', 'xyz');
    setRecipesViewState('tab', 'drinks');
    setRecipesViewState('recent', true);
    setRecipesViewState('canMake', true);
    setRecipesViewState('nutSel', ['protein']);
    setRecipesViewState('src', 'library');
    showSavedRecipe('r1');
    expect(getRecipesViewState()).toEqual({ ...INITIAL_VIEW_STATE, selId: 'r1' });
  });
  it('keeps the All / Mine / Library filter, starting at All', () => {
    expect(getRecipesViewState().src).toBe('all');
    setRecipesViewState('src', 'library');
    expect(getRecipesViewState().src).toBe('library');
  });
  it('keeps the section last used this visit, starting with none', () => {
    expect(getRecipesViewState().sec).toBeNull();
    setRecipesViewState('sec', 'drinks');
    expect(getRecipesViewState().sec).toBe('drinks');
    resetRecipesViewState();
    expect(getRecipesViewState().sec).toBeNull();
  });
  it('showSavedRecipe moves to the section the recipe belongs in, and keeps the section when none is given', () => {
    setRecipesViewState('sec', 'library');
    showSavedRecipe('r1');
    expect(getRecipesViewState().sec).toBe('library');
    showSavedRecipe('r2', 'recipes');
    expect(getRecipesViewState()).toMatchObject({ sec: 'recipes', selId: 'r2', q: '' });
  });
  it('does not share its arrays with the defaults', () => {
    setRecipesViewState('tagSel', ['a']);
    expect(INITIAL_VIEW_STATE.tagSel).toEqual([]);
  });
});
