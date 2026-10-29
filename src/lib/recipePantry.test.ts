import { describe, expect, it } from 'vitest';
import type { Grocery, GroceryItem } from '../types.ts';
import { addMissingMessage, matchHome, missingParts, nameWords, pantryStatus, splitIngredient } from './recipePantry.js';

const it_ = (id: string, n: string): GroceryItem => ({ id, n, store: 'Anywhere', qty: 1, cents: null, every: false, out: false });
const g = (...items: GroceryItem[]): Grocery => ({ stores: ['Anywhere'], items });

describe('splitIngredient', () => {
  it.each([
    ['1 ½ cups freshly grated Parmesan cheese, divided', { n: 'freshly grated Parmesan cheese', amt: '1 ½ cups' }],
    ['2 tablespoons olive oil', { n: 'olive oil', amt: '2 tablespoons' }],
    ['3 cloves garlic', { n: 'garlic', amt: '3 cloves' }],
    ['Salt', { n: 'Salt' }],
    ['1 (14 oz) can tomatoes', { n: 'tomatoes', amt: '1 (14 oz) can' }],
  ])('%s', (line, out) => expect(splitIngredient(line)).toEqual(out));
});

describe('nameWords', () => {
  it('lowers case, singularizes and drops filler and units', () => {
    expect(nameWords('Freshly grated Parmesan cheeses')).toEqual(['parmesan', 'cheese']);
    expect(nameWords('Tomatoes')).toEqual(['tomato']);
    expect(nameWords('chopped')).toEqual(['chopped']); // nothing else left: keep it
  });
});

describe('matchHome', () => {
  const items = [it_('a', 'Chicken thighs'), it_('b', 'Parmesan'), it_('c', 'Cream cheese'), it_('d', 'Garlic')];
  it('matches plurals and extra words, in either direction', () => {
    expect(matchHome({ n: 'chicken thigh' }, items)?.id).toBe('a');
    expect(matchHome({ n: 'freshly grated Parmesan cheese' }, items)?.id).toBe('b');
    expect(matchHome({ n: 'garlic cloves' }, items)?.id).toBe('d');
  });
  it('does not take a different product that merely contains the word', () => {
    const home = [it_('b', 'Butter'), it_('m', 'Milk'), it_('s', 'Sugar'), it_('t', 'Salt and pepper'), it_('e', 'Sea salt')];
    for (const n of ['peanut butter', 'coconut milk', 'brown sugar']) expect(matchHome({ n }, home), n).toBeNull();
    expect(matchHome({ n: 'salt' }, home)?.id).toBe('t'); // its first word
    expect(matchHome({ n: 'sea salt' }, home)?.id).toBe('e');
  });
  it('prefers an exact match and a pinned item', () => {
    expect(matchHome({ n: 'Cream cheese' }, [it_('x', 'Cheese'), it_('c', 'Cream cheese')])?.id).toBe('c');
    expect(matchHome({ n: 'garlic', home: 'a' }, items)?.id).toBe('a');
    expect(matchHome({ n: 'garlic', home: 'gone' }, items)?.id).toBe('d'); // a pin to a removed item falls back
  });
  it('is null when nothing matches', () => expect(matchHome({ n: 'saffron' }, items)).toBeNull());
});

describe('pantryStatus and missingParts', () => {
  const grocery = g(it_('a', 'Chicken thighs'), it_('d', 'Garlic'));
  const recipe = { ing: [{ n: 'chicken thighs' }, { n: 'garlic' }, { n: 'parsley' }, { n: 'Fresh parsley' }] };
  it('counts what is ticked at home this month', () => {
    const month = { lines: { a: { have: true as const } }, pulled: [] };
    const s = pantryStatus(recipe, grocery, month);
    expect(s).toMatchObject({ have: 1, total: 4 });
    expect(s.lines.map(l => l.have)).toEqual([true, false, false, false]);
  });
  it('splits the missing into items already on the list and new names, once each', () => {
    const s = pantryStatus(recipe, grocery, { lines: { a: { have: true } }, pulled: [] });
    const { already, add } = missingParts(s);
    expect(already.map(i => i.id)).toEqual(['d']);
    expect(add).toEqual(['parsley']);
  });
});

describe('addMissingMessage', () => {
  it.each([
    [{ added: 2, already: 0, refused: null }, 'Added 2 to To get.'],
    [{ added: 0, already: 1, refused: null }, '1 is on To get already.'],
    [{ added: 1, already: 3, refused: null }, 'Added 1 to To get. 3 are on To get already.'],
    [{ added: 0, already: 0, refused: null }, 'Everything is at home.'],
    [{ added: 1, already: 0, refused: 'Too many items.' }, 'Added 1 to To get. Too many items.'],
    [{ added: 0, already: 0, refused: 'Too many items.' }, 'Too many items.'],
  ])('%j', (r, text) => expect(addMissingMessage(r)).toBe(text));
});
