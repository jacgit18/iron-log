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

describe('a request nobody read', () => {
  it('goes stale after ten seconds, so it cannot open an unrelated form later', () => {
    requestRecipesJump({ kind: 'edit', id: 'r1' }, 1000);
    expect(takeRecipesJump(1000 + 10_001)).toBeNull();
    requestRecipesJump({ kind: 'new' }, 1000);
    expect(takeRecipesJump(1000 + 9_000)).toEqual({ kind: 'new' });
  });
});
