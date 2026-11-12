import { describe, expect, it } from 'vitest';
import { requestRecipesJump, takeRecipesJump } from './recipesJump.js';

describe('the one-shot request to open Recipes on a form', () => {
  it('is read once and then gone', () => {
    requestRecipesJump({ kind: 'edit', id: 'r1' });
    expect(takeRecipesJump()).toEqual({ kind: 'edit', id: 'r1' });
    expect(takeRecipesJump()).toBeNull();
  });
  it('can be cleared before it is read', () => {
    requestRecipesJump({ kind: 'new' });
    requestRecipesJump(null);
    expect(takeRecipesJump()).toBeNull();
  });
});
