import { describe, expect, it } from 'vitest';
import type { GroceryItem } from '../types.ts';
import type { Receipt } from '../shared/receipt.js';
import { aliasAddsFor, applyNames, applySavedNames, findByAlias, movedFrom, planAliases, resolveName, withoutAlias } from './groceryAliases.js';

const item = (id: string, n: string, aliases?: string[], store = 'Aldi'): GroceryItem => ({ id, n, store, qty: 1, cents: 100, every: true, out: false, ...(aliases ? { aliases } : {}) });
const line = (text: string, over: Partial<Receipt['lines'][number]> = {}) => ({ text, qty: 1, grossCents: 300, discountCents: 0, matchId: null, ...over });
const receipt = (...lines: Receipt['lines']): Receipt => ({ lines });

describe('findByAlias', () => {
  const items = [item('milk', 'Milk', ['ORG WHL MLK']), item('egg', 'Eggs')];
  it('matches ignoring case, edge spaces and doubled spaces', () => {
    expect(findByAlias(items, '  org   whl mlk ')?.id).toBe('milk');
    expect(findByAlias(items, 'ORG WHL')).toBeUndefined();
    expect(findByAlias(items, '   ')).toBeUndefined();
  });
  it('ignores the names of an item that was removed', () => {
    expect(findByAlias(items.filter(i => i.id !== 'milk'), 'ORG WHL MLK')).toBeUndefined();
  });
});

describe('applySavedNames', () => {
  const items = [item('milk', 'Milk', ['ORG WHL MLK', 'MLK 1GAL']), item('egg', 'Eggs')];
  it('points a saved text at its item over the model guess, and says which lines', () => {
    const r = receipt(line('org whl mlk', { matchId: 'egg' }), line('MLK 1GAL'), line('BREAD'));
    const out = applySavedNames(r, items);
    expect(out.receipt.lines.map(l => l.matchId)).toEqual(['milk', 'milk', null]);
    expect(out.remembered).toEqual({ 0: 'milk', 1: 'milk' });
  });
  it('leaves a model guess alone when no name is saved and returns the same receipt', () => {
    const r = receipt(line('BREAD', { matchId: 'egg' }));
    const out = applySavedNames(r, items);
    expect(out.receipt).toBe(r);
    expect(out.remembered).toEqual({});
  });
  it('never matches a return or discount line', () => {
    const out = applySavedNames(receipt(line('ORG WHL MLK', { grossCents: -150 })), items);
    expect(out.receipt.lines[0]!.matchId).toBeNull();
  });
});

describe('planAliases', () => {
  it('adds a text to an item, keeping the ones it has', () => {
    const p = planAliases([item('milk', 'Milk', ['A'])], [{ id: 'milk', text: 'B' }]);
    expect(p.next).toEqual({ milk: ['A', 'B'] });
  });
  it('lets two texts map to one item', () => {
    const p = planAliases([item('milk', 'Milk')], [{ id: 'milk', text: 'A' }, { id: 'milk', text: 'B' }]);
    expect(p.next.milk).toEqual(['A', 'B']);
  });
  it('moves a text held by another item and says so', () => {
    const p = planAliases([item('milk', 'Milk', ['ORG MLK']), item('oat', 'Oat milk')], [{ id: 'oat', text: 'org  mlk' }]);
    expect(p.next).toEqual({ milk: [], oat: ['org mlk'] });
    expect(p.moved).toEqual([{ text: 'org mlk', from: 'milk', to: 'oat' }]);
  });
  it('the latest rename of one text wins within a receipt', () => {
    const p = planAliases([item('a', 'A'), item('b', 'B')], [{ id: 'a', text: 'X' }, { id: 'b', text: 'x' }]);
    expect(p.next).toEqual({ b: ['x'] }); // a's list is back to what it was, so it is not a change
  });
  it('reports nothing for a text the item already has, and skips an unknown id', () => {
    const p = planAliases([item('milk', 'Milk', ['A'])], [{ id: 'milk', text: 'a' }, { id: 'gone', text: 'Z' }]);
    expect(p.next).toEqual({});
    expect(p.moved).toEqual([]);
  });
  it('keeps at most 20 names, dropping the oldest', () => {
    const have = Array.from({ length: 20 }, (_, i) => `n${i}`);
    const p = planAliases([item('milk', 'Milk', have)], [{ id: 'milk', text: 'new' }]);
    expect(p.next.milk).toHaveLength(20);
    expect(p.next.milk![0]).toBe('n1');
    expect(p.next.milk!.at(-1)).toBe('new');
  });
});

describe('movedFrom, withoutAlias', () => {
  const items = [item('milk', 'Milk', ['A']), item('oat', 'Oat')];
  it('names the item a text would move from', () => {
    expect(movedFrom(items, 'a', 'oat')?.id).toBe('milk');
    expect(movedFrom(items, 'a', 'milk')).toBeUndefined();
    expect(movedFrom(items, 'zzz', 'oat')).toBeUndefined();
  });
  it('forgets one name by its key', () => { expect(withoutAlias(['A', 'B'], ' a ')).toEqual(['B']); });
});

describe('resolveName', () => {
  const all = [item('milk', 'Milk'), item('oat', 'Oat milk'), item('milk2', 'Milk', undefined, 'Lidl')];
  it('keeps the row when the name is empty or unchanged', () => {
    expect(resolveName('  ', all[0]!, all)).toEqual({ kind: 'same' });
    expect(resolveName('milk', all[0]!, all)).toEqual({ kind: 'same' });
  });
  it('matches another item that has the name instead of making a duplicate, preferring the row item’s store', () => {
    expect(resolveName('oat MILK', all[0]!, all)).toEqual({ kind: 'match', id: 'oat' });
    expect(resolveName('Milk', all[1]!, all)).toEqual({ kind: 'match', id: 'milk' });
    expect(resolveName('Milk', { ...all[1]!, store: 'Lidl' }, all)).toEqual({ kind: 'match', id: 'milk2' });
  });
  it('renames the row item, or makes a new item for a row with none', () => {
    expect(resolveName('Whole milk', all[0]!, all)).toEqual({ kind: 'rename' });
    expect(resolveName('Whole milk', null, all)).toEqual({ kind: 'new' });
    expect(resolveName('Oat milk', null, all)).toEqual({ kind: 'match', id: 'oat' });
  });
});

describe('aliasAddsFor', () => {
  const row = (over = {}) => ({ text: 'ORG MLK', itemId: 'milk', include: true, touched: true, remember: true, ...over });
  const used = new Set(['milk', 'real9']);
  it('saves only changed, ticked rows with Remember on whose item the plan uses', () => {
    expect(aliasAddsFor([row()], used, {})).toEqual([{ id: 'milk', text: 'ORG MLK' }]);
    expect(aliasAddsFor([row({ touched: false })], used, {})).toEqual([]);
    expect(aliasAddsFor([row({ remember: false })], used, {})).toEqual([]);
    expect(aliasAddsFor([row({ include: false })], used, {})).toEqual([]);
    expect(aliasAddsFor([row({ itemId: 'egg' })], used, {})).toEqual([]);
    expect(aliasAddsFor([row({ itemId: null })], used, {})).toEqual([]);
  });
  it('swaps a sheet-only id for the item Apply made', () => {
    expect(aliasAddsFor([row({ itemId: 'new:1' })], used, { 'new:1': 'real9' })).toEqual([{ id: 'real9', text: 'ORG MLK' }]);
  });
});

describe('applyNames', () => {
  const fake = (start: GroceryItem[]) => {
    let list = start;
    return {
      get list() { return list; },
      items: () => list,
      updateGroceryItem: (id: string, patch: { n?: string; aliases?: string[] }) => {
        if (patch.n && list.some(x => x.id !== id && x.n === patch.n)) return 'taken';
        list = list.map(x => (x.id === id ? { ...x, ...(patch.n ? { n: patch.n } : {}), ...(patch.aliases ? { aliases: patch.aliases } : {}) } : x));
        return null;
      },
    };
  };
  it('renames the item, saves the text, and returns what Undo needs', () => {
    const api = fake([item('milk', 'Milk'), item('oat', 'Oat milk', ['ORG MLK'])]);
    const out = applyNames(api, { milk: 'Whole milk' }, [{ id: 'milk', text: 'ORG MLK' }]);
    expect(api.list.find(x => x.id === 'milk')).toMatchObject({ n: 'Whole milk', aliases: ['ORG MLK'] });
    expect(api.list.find(x => x.id === 'oat')?.aliases).toEqual([]);
    expect(out).toEqual({ names: { milk: 'Milk' }, aliases: { milk: [], oat: ['ORG MLK'] }, saved: 1, refused: [] });
  });
  it('names a refused rename and still saves the text', () => {
    const api = fake([item('milk', 'Milk'), item('oat', 'Oat')]);
    const out = applyNames(api, { milk: 'Oat' }, [{ id: 'milk', text: 'X' }]);
    expect(out.refused).toEqual(['Oat (taken)']);
    expect(out.names).toEqual({});
    expect(api.list[0]!.aliases).toEqual(['X']);
  });
  it('saves nothing for a text the item already has', () => {
    const api = fake([item('milk', 'Milk', ['X'])]);
    expect(applyNames(api, {}, [{ id: 'milk', text: 'x' }])).toEqual({ names: {}, aliases: {}, saved: 0, refused: [] });
  });
});

describe('Undo of Apply', () => {
  it('puts back the names and receipt names Apply changed, before the created items go', async () => {
    const { restoreSnapshot } = await import('./groceryReceipt.js');
    const calls: string[] = [];
    const api = new Proxy({}, { get: (_, k) => (...a: unknown[]) => { calls.push(`${String(k)} ${JSON.stringify(a)}`); return null; } });
    restoreSnapshot({ month: '2026-09', lines: {}, usual: {}, tax: null, created: ['n1'], names: { milk: 'Milk' }, aliases: { milk: [], oat: ['ORG MLK'] } }, api as never);
    expect(calls).toEqual([
      'updateGroceryItem ["milk",{"n":"Milk"}]',
      'updateGroceryItem ["milk",{"aliases":[]}]',
      'updateGroceryItem ["oat",{"aliases":["ORG MLK"]}]',
      'removeGroceryItem ["n1",{"quiet":true}]',
    ]);
  });
});
