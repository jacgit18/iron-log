import { describe, expect, it } from 'vitest';
import { desiredRows, documentFor, parsePath, pathsOf, type PathKind } from './documents.js';
import { dataFileDocs } from './legacy.js';
import { mirrorOf } from './testing.js';

const kind = parsePath('recipes/main') as PathKind;
const chili = { id: 'r1', n: 'Chili', cat: 'protein', ing: [{ n: 'Beans', amt: '2 cans' }], steps: ['Simmer.'] };
const dip = { id: 'r2', n: 'Dip', cat: 'sauces', ing: [{ n: 'Yogurt' }], steps: [] };

describe('recipes/main', () => {
  it('is a path of its own', () => {
    expect(kind).toEqual({ kind: 'recipes' });
    expect(parsePath('recipes/other')).toBeNull();
  });
  it('keeps the recipes and their order through rows', () => {
    const m = mirrorOf(desiredRows(kind, { items: [dip, chili] }, new Map()));
    expect(documentFor(kind, m as never)).toEqual({ items: [dip, chili] });
  });
  it('keeps the link of an ingredient to a sauce through rows (backup and sync)', () => {
    const linked = { ...chili, ing: [{ n: 'Dip', amt: '2 tbsp', rid: 'r2' }] };
    const m = mirrorOf(desiredRows(kind, { items: [dip, linked] }, new Map()));
    expect(documentFor(kind, m as never)).toEqual({ items: [dip, linked] });
    expect(dataFileDocs({ logs: {}, weeks: {}, stretchWeeks: {}, programs: {}, body: [], library: [], experiments: [], stretches: null, supplements: null, config: {}, grocery: null, recipes: [linked] } as never).get('recipes/main')).toEqual({ items: [linked] });
  });
  it('cleans what it stores and drops a recipe with no name or a repeated id', () => {
    const rows = desiredRows(kind, { items: [{ ...chili, cat: 'soup' }, { id: 'x', n: '' }, chili] }, new Map());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ table: 'list_items', list: 'recipe', key: 'recipe/r1', item: { cat: 'other' } });
  });
  it('has no document before the first recipe, and an empty one after the last is removed', () => {
    expect(documentFor(kind, new Map() as never)).toBeNull();
    expect(desiredRows(kind, { items: [] }, new Map())).toEqual([]);
  });
  it('tells the app when a pulled recipe row changes the document', () => {
    const [row] = [...mirrorOf(desiredRows(kind, { items: [chili] }, new Map())).values()];
    expect(pathsOf(row!)).toEqual(['recipes/main']);
  });
});

describe('an export file with recipes', () => {
  it('uploads them to recipes/main, and a file without any adds no document', () => {
    const file = { logs: {}, weeks: {}, stretchWeeks: {}, programs: {}, body: [], library: [], experiments: [], stretches: null, supplements: null, config: {}, grocery: null };
    expect(dataFileDocs({ ...file, recipes: [chili] } as never).get('recipes/main')).toEqual({ items: [chili] });
    expect(dataFileDocs(file as never).has('recipes/main')).toBe(false);
  });
});
