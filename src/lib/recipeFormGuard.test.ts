import { describe, expect, it } from 'vitest';
import { activeFormGuard, setFormGuard } from './recipeFormGuard';

const g = () => ({ holds: () => true, ask: () => {} });

describe('recipe form guard', () => {
  it('is empty until a form registers, and removes only its own entry', () => {
    expect(activeFormGuard()).toBeNull();
    const one = g(), two = g();
    const offOne = setFormGuard(one), offTwo = setFormGuard(two);
    offOne(); // an earlier form going away leaves the later form's guard
    expect(activeFormGuard()).toBe(two);
    offTwo();
    expect(activeFormGuard()).toBeNull();
  });
});
