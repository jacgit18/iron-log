import { describe, expect, it } from 'vitest';
import type { Grocery, GroceryItem } from '../types.ts';
import { SYNONYMS, addMissingMessage, ingredientName, isAlwaysHave, matchHome, missingParts, nameWords, pantryStatus, rankItems, splitIngredient, suggestItem, suggestionPins } from './recipePantry.js';

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

describe('a swapped ingredient', () => {
  const items = [it_('v', 'Apple cider vinegar'), it_('w', 'White wine vinegar')];
  const ing = { n: 'white wine vinegar', sub: 'apple cider vinegar' };
  it('is called by the swap', () => {
    expect(ingredientName(ing)).toBe('apple cider vinegar');
    expect(ingredientName({ n: 'salt' })).toBe('salt');
  });
  it('matches the swap, not the name in the recipe', () => expect(matchHome(ing, items)?.id).toBe('v'));
  it('matches the name again with no swap', () => expect(matchHome({ n: 'white wine vinegar' }, items)?.id).toBe('w'));
  it('yields to a pin', () => expect(matchHome({ ...ing, home: 'w' }, items)?.id).toBe('w'));
  it('is added to To get by the swap name when it is not on the list', () => {
    const s = pantryStatus({ ing: [{ n: 'white wine vinegar', sub: 'rice vinegar' }] }, g(), { lines: {}, pulled: [] });
    expect(missingParts(s).add).toEqual(['rice vinegar']);
  });
});

describe('a skipped ingredient', () => {
  const grocery = g(it_('a', 'Chicken thighs'));
  const recipe = { ing: [{ n: 'chicken thighs' }, { n: 'parsley', skip: true as const }, { n: 'paprika' }] };
  const month = { lines: { a: { have: true as const } }, pulled: [] };
  it('stays listed but is not counted', () => {
    const s = pantryStatus(recipe, grocery, month);
    expect(s.lines).toHaveLength(3);
    expect(s.lines.map(l => l.skipped)).toEqual([false, true, false]);
    expect(s).toMatchObject({ have: 1, total: 2 });
  });
  it('is never added to To get', () => expect(missingParts(pantryStatus(recipe, grocery, month)).add).toEqual(['paprika']));
  it('leaves nothing to count when every ingredient is skipped', () => {
    expect(pantryStatus({ ing: [{ n: 'salt', skip: true }] }, grocery, month)).toMatchObject({ have: 0, total: 0 });
  });
});

describe('water is always at home', () => {
  it.each(['water', 'Water', 'cold water', 'boiling water', 'warm water', 'ice water', 'tap water', 'lukewarm water', 'hot water'])('%s', n => expect(isAlwaysHave(n)).toBe(true));
  it.each(['coconut water', 'water chestnuts', 'rose water', 'watermelon', 'salt', 'sparkling water and lime'])('%s is not', n => expect(isAlwaysHave(n)).toBe(false));
  it('shows Have with no At home items, counts, and is never added to To get', () => {
    const s = pantryStatus({ ing: [{ n: 'cold water' }, { n: 'rice' }] }, g(), { lines: {}, pulled: [] });
    expect(s.lines.map(l => [l.have, l.always])).toEqual([[true, true], [false, false]]);
    expect(s).toMatchObject({ have: 1, total: 2 });
    expect(missingParts(s).add).toEqual(['rice']);
  });
  it('is not water when it is skipped, and a swap to water is water', () => {
    expect(pantryStatus({ ing: [{ n: 'water', skip: true }] }, g(), { lines: {}, pulled: [] })).toMatchObject({ have: 0, total: 0 });
    expect(pantryStatus({ ing: [{ n: 'stock', sub: 'water' }] }, g(), { lines: {}, pulled: [] })).toMatchObject({ have: 1, total: 1 });
  });
});

describe('matching by all the words of a longer name', () => {
  const home = [it_('c', 'Boneless skinless chicken breast'), it_('o', 'Extra virgin olive oil'), it_('p', 'Peanut butter'), it_('b', 'Butter')];
  it('finds the item in either direction when the shorter name has two or more words', () => {
    expect(matchHome({ n: 'chicken breast' }, home)?.id).toBe('c');
    expect(matchHome({ n: 'olive oil' }, home)?.id).toBe('o');
    expect(matchHome({ n: 'boneless skinless chicken breast, sliced' }, [it_('x', 'Chicken breast')])?.id).toBe('x');
  });
  it('takes the closest when several hold the words', () => {
    expect(matchHome({ n: 'chicken breast' }, [it_('l', 'Large boneless skinless chicken breast'), it_('m', 'Boneless chicken breast')])?.id).toBe('m');
  });
  it('still does not match a one-word name found inside another', () => {
    expect(matchHome({ n: 'butter' }, [it_('p', 'Peanut butter')])).toBeNull();
    expect(matchHome({ n: 'oil' }, [it_('o', 'Extra virgin olive oil')])).toBeNull();
    expect(matchHome({ n: 'peanut butter' }, [it_('b', 'Butter')])).toBeNull();
  });
  it('keeps a pin above it', () => expect(matchHome({ n: 'chicken breast', home: 'b' }, home)?.id).toBe('b'));
});

describe('the same ingredient under two names', () => {
  it.each([
    ['scallions', 'Green onions'], ['green onion', 'Scallion'], ['cilantro', 'Fresh coriander leaves'], ['garbanzo beans', 'Chickpeas'],
    ["confectioners' sugar", 'Powdered sugar'], ['icing sugar', 'Powdered sugar'], ['courgette', 'Zucchini'], ['aubergines', 'Eggplant'], ['sweet pepper', 'Bell peppers'],
  ])('%s is %s', (a, b) => expect(matchHome({ n: a }, [it_('x', b)])?.id).toBe('x'));
  it('folds to the same words', () => expect(nameWords('Green onions, sliced')).toEqual(nameWords('scallion')));
  it('leaves near-substitutes and other regional meanings apart', () => {
    for (const [a, b] of [['butter', 'Margarine'], ['lemon juice', 'Lime juice'], ['coriander seeds', 'Cilantro'], ['castor sugar', 'Powdered sugar']]) {
      expect(matchHome({ n: a! }, [it_('x', b!)]), `${a} / ${b}`).toBeNull();
    }
  });
  it('keeps the list to named pairs', () => expect(SYNONYMS.every(r => r.length >= 2)).toBe(true));
});

describe('suggestions for what matches nothing', () => {
  const home = [it_('p', 'Peanut butter'), it_('r', 'Red wine vinegar'), it_('v', 'White wine vinegar'), it_('g', 'Garlic powder'), it_('o', 'Red onions')];
  it('offers the item that shares a meaningful word, never one that shares only a colour', () => {
    expect(suggestItem({ n: 'butter' }, home)?.id).toBe('p');
    expect(suggestItem({ n: 'apple cider vinegar' }, home)?.id).toBe('r'); // vinegar: the shorter name, then A to Z
    expect(suggestItem({ n: 'red pepper' }, home)).toBeNull();
    expect(suggestItem({ n: 'saffron' }, home)).toBeNull();
  });
  it('ranks the whole list, most in common first', () => {
    expect(rankItems({ n: 'garlic' }, home)[0]!.id).toBe('g');
    expect(rankItems({ n: 'garlic' }, home)).toHaveLength(home.length);
  });
  it('is only given to an ingredient with no match, not skipped, not water', () => {
    const s = pantryStatus({ ing: [{ n: 'butter' }, { n: 'garlic powder' }, { n: 'butter', skip: true }, { n: 'water' }] }, g(...home), { lines: {}, pulled: [] });
    expect(s.lines.map(l => l.suggest?.id ?? null)).toEqual(['p', null, null, null]);
    expect(s.lines[0]).toMatchObject({ item: null, have: false }); // a suggestion never counts as a match
    expect(suggestionPins(s)).toEqual([{ index: 0, home: 'p' }]);
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
