import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// Forget a receipt name and Undo (brief receipt-rename-memory): Undo puts the name back only while it is still free and the item's names are as Forget left them.
let useAppStore: typeof import('./useAppStore.js').useAppStore;
const st = () => useAppStore.getState();
const get = (n: string) => st().grocery.items.find(i => i.n === n)!;
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(() => {
  clearStorage();
  useAppStore.setState({ grocery: { stores: [], items: [] }, groceryMonths: {}, removed: null });
  st().addGroceryItem({ n: 'Milk', store: '', qty: '1', price: '3', every: true });
  st().addGroceryItem({ n: 'Oat', store: '', qty: '1', price: '4', every: true });
  st().updateGroceryItem(get('Milk').id, { aliases: ['ORG MLK', 'MLK 1GAL'] });
});

describe('forgetGroceryAlias', () => {
  it('removes the name, and Undo restores the names exactly as they were', () => {
    st().forgetGroceryAlias(get('Milk').id, 'ORG MLK');
    expect(get('Milk').aliases).toEqual(['MLK 1GAL']);
    st().undoRemoved();
    expect(get('Milk').aliases).toEqual(['ORG MLK', 'MLK 1GAL']);
  });
  it('Undo does not put the text back when another item saved it meanwhile', () => {
    st().forgetGroceryAlias(get('Milk').id, 'ORG MLK');
    st().updateGroceryItem(get('Oat').id, { aliases: ['org mlk'] });
    st().undoRemoved();
    expect(get('Milk').aliases).toEqual(['MLK 1GAL']);
    expect(get('Oat').aliases).toEqual(['org mlk']);
  });
  it('Undo leaves the names alone when they changed after Forget', () => {
    st().forgetGroceryAlias(get('Milk').id, 'ORG MLK');
    st().updateGroceryItem(get('Milk').id, { aliases: ['MLK 1GAL', 'NEW ONE'] });
    st().undoRemoved();
    expect(get('Milk').aliases).toEqual(['MLK 1GAL', 'NEW ONE']);
  });
  it('clears the field when the last name goes, and Undo brings it back', () => {
    st().forgetGroceryAlias(get('Oat').id, 'nope');
    expect(st().removed).toBeNull();
    st().updateGroceryItem(get('Oat').id, { aliases: ['ONLY'] });
    st().forgetGroceryAlias(get('Oat').id, 'only');
    expect(get('Oat')).not.toHaveProperty('aliases');
    st().undoRemoved();
    expect(get('Oat').aliases).toEqual(['ONLY']);
  });
});
