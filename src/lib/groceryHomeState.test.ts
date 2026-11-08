import { describe, expect, it } from 'vitest';
import type { GroceryItem } from '../types.ts';
import { boughtMonthText, homeFilterChips, homeFilterEmpty, homeFilterItems, homeStateText, toBuyText } from './groceryHomeState.js';

const item = (id: string): GroceryItem => ({ id, n: id, store: 'Costco' }) as GroceryItem;
const items = [item('eggs'), item('rice'), item('milk')];
const has = (i: GroceryItem) => i.id !== 'milk';

describe('Inventory row state', () => {
  it('names a ticked item Have and an unticked one On Shopping', () => {
    expect(homeStateText(true)).toBe('Have');
    expect(homeStateText(false)).toBe('On Shopping');
  });

  it('says the month an item was bought in, and nothing for a bad key', () => {
    expect(boughtMonthText('2026-11')).toBe('bought Nov');
    expect(boughtMonthText('2026-01')).toBe('bought Jan');
    expect(boughtMonthText('2026-13')).toBe('');
    expect(boughtMonthText('')).toBe('');
  });

  it('counts what is left to buy in a store header', () => {
    expect(toBuyText(3, 2)).toBe('1 to buy · 2 you have');
    expect(toBuyText(1, 1)).toBe('0 to buy · 1 you have');
  });
});

describe('Need / Have / All', () => {
  it('filters on the tick', () => {
    expect(homeFilterItems(items, has, 'all').map(i => i.id)).toEqual(['eggs', 'rice', 'milk']);
    expect(homeFilterItems(items, has, 'need').map(i => i.id)).toEqual(['milk']);
    expect(homeFilterItems(items, has, 'have').map(i => i.id)).toEqual(['eggs', 'rice']);
  });

  it('counts over every item, with one store or none', () => {
    expect(homeFilterChips(items, has).map(c => `${c.label} ${c.count}`)).toEqual(['All 3', 'Need 1', 'Have 2']);
    expect(homeFilterChips([], has).map(c => c.count)).toEqual([0, 0, 0]);
  });

  it('has a line for an empty filter', () => {
    expect(homeFilterEmpty('need')).toBe('Nothing to buy. You have everything.');
    expect(homeFilterEmpty('have')).toBe('You have none of these yet.');
  });
});
