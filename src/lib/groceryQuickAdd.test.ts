import { describe, expect, it } from 'vitest';
import { cleanQuickName, findQuickAdded, quickAddForm, quickAddLabel, quickAddNotice } from './groceryQuickAdd.js';
import type { GroceryItem } from '../types.ts';

const item = (id: string, n: string, store: string): GroceryItem => ({ id, n, store, qty: 1, cents: null, every: false, out: true });

describe('quick add form', () => {
  it('is a one-time item of one, with no price', () => {
    expect(quickAddForm('Milk', 'Aldi')).toEqual({ n: 'Milk', store: 'Aldi', qty: '1', price: '', every: false, oneTime: true });
  });
  it('keeps the store as given, Anywhere being empty', () => {
    expect(quickAddForm('Milk', '').store).toBe('');
  });
});

describe('cleanQuickName', () => {
  it('trims, collapses spaces and stops at 80 characters', () => {
    expect(cleanQuickName('  Oat   milk ')).toBe('Oat milk');
    expect(cleanQuickName('x'.repeat(100))).toHaveLength(80);
    expect(cleanQuickName('   ')).toBe('');
  });
});

describe('findQuickAdded', () => {
  const items = [item('a', 'Milk', 'Aldi'), item('b', 'Milk', 'Lidl'), item('c', 'Oat milk', '')];
  it('finds the item in that store only, ignoring capitals and extra spaces', () => {
    expect(findQuickAdded(items, ' milk ', 'Lidl')?.id).toBe('b');
    expect(findQuickAdded(items, 'OAT  MILK', '')?.id).toBe('c');
  });
  it('finds nothing when the name is not in that store', () => {
    expect(findQuickAdded(items, 'Eggs', 'Aldi')).toBeUndefined();
    expect(findQuickAdded(items, 'Oat milk', 'Aldi')).toBeUndefined();
  });
});

describe('words', () => {
  it('names the row and the notice', () => {
    expect(quickAddLabel('Aldi')).toBe('Add item to Aldi');
    expect(quickAddNotice('Milk', 'Aldi')).toBe("Added Milk to Aldi. It is a one-time item: it leaves Inventory and next month's list after you buy it.");
  });
});
