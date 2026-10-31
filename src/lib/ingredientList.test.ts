import { describe, expect, it } from 'vitest';
import { ingredientsToText, parseIngredientList, readList } from './ingredientList.js';

const rows = (t: string) => parseIngredientList(t).rows;

describe('parseIngredientList', () => {
  it('reads amount, name and an "or" alternative', () => {
    expect(rows('1 cup rolled oats\n1 cup milk or oat milk\n1 tbsp honey\npinch salt')).toEqual([
      { n: 'rolled oats', amt: '1 cup' },
      { n: 'milk', amt: '1 cup', sub: 'oat milk' },
      { n: 'honey', amt: '1 tbsp' },
      { n: 'salt', amt: 'pinch' },
    ]);
  });
  it.each([
    ['2 eggs', { n: 'eggs', amt: '2' }],
    ['2 lemons', { n: 'lemons', amt: '2' }],
    ['1½ cups flour', { n: 'flour', amt: '1½ cups' }],
    ['1 ½ cups flour', { n: 'flour', amt: '1 ½ cups' }],
    ['1/2 tsp salt', { n: 'salt', amt: '1/2 tsp' }],
    ['1 1/2 cups milk', { n: 'milk', amt: '1 1/2 cups' }],
    ['2-3 cloves garlic', { n: 'garlic', amt: '2-3 cloves' }],
    ['250 g butter', { n: 'butter', amt: '250 g' }],
    ['½ onion', { n: 'onion', amt: '½' }],
    ['salt', { n: 'salt', amt: '' }],
    ['dash of pepper', { n: 'pepper', amt: 'dash' }],
    ['- 2 tbsp oil', { n: 'oil', amt: '2 tbsp' }],
  ])('%s', (line, row) => expect(rows(line)).toEqual([row]));
  it('skips blank lines and keeps a line with no amount as a name', () => {
    expect(rows('\n  \nolive oil\n')).toEqual([{ n: 'olive oil', amt: '' }]);
  });
  it('drops an alternative that repeats the name', () => expect(rows('1 cup milk or Milk')).toEqual([{ n: 'milk', amt: '1 cup' }]));
  it('keeps every alternative after the first "or" together', () => expect(rows('1 cup milk or oat milk or soy milk')[0]).toEqual({ n: 'milk', amt: '1 cup', sub: 'oat milk or soy milk' }));
  it('stops at 40 ingredients and says it cut some', () => {
    const t = Array.from({ length: 45 }, (_, i) => `1 cup item${i}`).join('\n');
    const r = parseIngredientList(t);
    expect(r.rows).toHaveLength(40);
    expect(r.cut).toBe(true);
    expect(parseIngredientList('1 cup milk').cut).toBe(false);
  });
  it('an empty list has no rows', () => expect(rows('   \n')).toEqual([]));
});

describe('ingredientsToText', () => {
  it('writes the lines back and the text parses to the same rows', () => {
    const r = [{ n: 'rolled oats', amt: '1 cup' }, { n: 'milk', amt: '1 cup', sub: 'oat milk' }, { n: 'salt', amt: 'pinch' }, { n: 'garlic', amt: '' }];
    expect(ingredientsToText(r)).toBe('1 cup rolled oats\n1 cup milk or oat milk\npinch salt\ngarlic');
    expect(rows(ingredientsToText(r))).toEqual([
      { n: 'rolled oats', amt: '1 cup' }, { n: 'milk', amt: '1 cup', sub: 'oat milk' }, { n: 'salt', amt: 'pinch' }, { n: 'garlic', amt: '' },
    ]);
  });
  it('leaves out rows with no name', () => expect(ingredientsToText([{ n: ' ', amt: '1 cup' }, { n: 'tea', amt: '' }])).toBe('tea'));
});

describe('readList', () => {
  const tomatoes = { n: 'tomatoes', amt: '1 (14 oz) can', home: 'it-1' };
  const saltPepper = { n: 'salt or pepper', amt: '1 tsp', skip: true as const };
  const milk = { n: 'milk', amt: '1 cup', sub: 'oat milk' };
  it('keeps the row of a line that was not changed, even when its text would read back differently', () => {
    const r = readList('1 (14 oz) can tomatoes\n1 tsp salt or pepper\n1 cup milk or oat milk', [tomatoes, saltPepper, milk]);
    expect(r.lines).toEqual([{ old: tomatoes }, { old: saltPepper }, { old: milk }]);
  });
  it('reads only the line that was changed or added', () => {
    const r = readList('1 (14 oz) can tomatoes\n2 cups milk\n1 tbsp honey', [tomatoes, milk]);
    expect(r.lines).toEqual([{ old: tomatoes }, { row: { n: 'milk', amt: '2 cups' } }, { row: { n: 'honey', amt: '1 tbsp' } }]);
  });
  it('uses each earlier row once, so a repeated line is read again', () => {
    const r = readList('1 cup milk or oat milk\n1 cup milk or oat milk', [milk]);
    expect(r.lines).toEqual([{ old: milk }, { row: { n: 'milk', amt: '1 cup', sub: 'oat milk' } }]);
  });
  it('drops blank lines, strips a bullet from a new line, and stops at 40', () => {
    expect(readList('\n- 1 cup rice\n', []).lines).toEqual([{ row: { n: 'rice', amt: '1 cup' } }]);
    const many = Array.from({ length: 45 }, (_, i) => `1 cup item${i}`).join('\n');
    const r = readList(many, []);
    expect(r.lines).toHaveLength(40);
    expect(r.cut).toBe(true);
  });
});
