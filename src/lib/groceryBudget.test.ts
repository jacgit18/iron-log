import { describe, expect, it } from 'vitest';
import { budgetListNote, budgetStatus } from './groceryBudget.js';
import { validGroceryBudget } from '../shared/validate.js';
import { normConfig } from '../shared/config.js';

describe('budgetStatus', () => {
  it('is ok well under the budget', () => {
    expect(budgetStatus(40000, 10000, 20000)).toEqual({ pct: 25, left: 30000, over: 0, tone: 'ok', plannedOver: 0 });
  });
  it('warns from 80% up to the budget, and exactly at it is not over', () => {
    expect(budgetStatus(40000, 32000, 32000).tone).toBe('near');
    const full = budgetStatus(40000, 40000, 40000);
    expect(full).toMatchObject({ tone: 'near', left: 0, over: 0, pct: 100 });
  });
  it('says how far over, and the bar stops at full', () => {
    expect(budgetStatus(40000, 45000, 45000)).toEqual({ pct: 100, left: 0, over: 5000, tone: 'over', plannedOver: 0 });
  });
  it('warns when the plan is over while spending is still inside', () => {
    expect(budgetStatus(40000, 10000, 52000).plannedOver).toBe(12000);
  });
});

describe('budgetListNote', () => {
  it('says what is left to spend, without the list total', () => {
    expect(budgetListNote(21700)).toBe('You still have $217.00 left in your budget to spend.');
  });
  it('says the budget is used up instead of $0.00 left', () => {
    expect(budgetListNote(0)).toBe('Your budget is used up.');
  });
});

describe('groceryBudget in the config', () => {
  it('accepts whole cents and drops anything else', () => {
    expect(validGroceryBudget(40000)).toBe(true);
    [0, -5, 12.5, NaN, '400', 1e9, null].forEach(v => expect(validGroceryBudget(v)).toBe(false));
    expect(normConfig({ groceryBudget: 40000 }).groceryBudget).toBe(40000);
    expect('groceryBudget' in normConfig({ groceryBudget: 'lots' })).toBe(false);
  });
});
