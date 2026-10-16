import { describe, it, expect } from 'vitest';
import { pickerOptions, pickerKey } from './picker.js';

const mine = [
  { id: 'lat', name: 'Cable Lateral Raise', badge: 'Custom' },
  { id: 'row', name: 'Seated Cable Row' },
  { id: 'c:fedb:Curl', name: 'Barbell Curl', catalogId: 'c:fedb:Curl', badge: 'Library' },
];
const cat = (id: string, name: string, brand?: string) => ({ id, name, ...(brand ? { brand } : {}), data: {} });
const catalog = [cat('c:fedb:Pull', 'Cable Lat Pulldown'), cat('c:fedb:Kneel', 'Cable Lateral Raise (Kneeling)'), cat('c:fedb:Lat', 'cable  lateral raise'), cat('c:fedb:Curl', 'Barbell Curl'), cat('c:fedb:Squat', 'Squat')];
const names = (g: { shown: { name: string }[] }) => g.shown.map(x => x.name);

describe('pickerOptions', () => {
  it('lists yours first, then catalog items you do not have, then a create row', () => {
    const o = pickerOptions('cable lat', mine, catalog);
    expect(names(o.mine)).toEqual(['Cable Lateral Raise']);
    expect(names(o.catalog)).toEqual(['Cable Lat Pulldown', 'Cable Lateral Raise (Kneeling)']);
    expect(o.create).toBe('cable lat');
  });
  it('leaves out a catalog item already yours by catalog id or by the same name (spaces and case ignored)', () => {
    const o = pickerOptions('curl', mine, catalog);
    expect(names(o.catalog)).toEqual([]);
    expect(names(pickerOptions('lateral', mine, catalog).catalog)).toEqual(['Cable Lateral Raise (Kneeling)']);
  });
  it('matches every word anywhere in the name, and puts names that start with what is typed first', () => {
    expect(names(pickerOptions('row cable', mine, []).mine)).toEqual(['Seated Cable Row']);
    expect(names(pickerOptions('ca', mine, []).mine)).toEqual(['Cable Lateral Raise', 'Seated Cable Row']);
    expect(names(pickerOptions('s', mine, catalog).catalog)).toEqual(['Squat', 'Cable Lateral Raise (Kneeling)']);
  });
  it('with nothing typed lists all of yours A to Z, no catalog, no create row', () => {
    const o = pickerOptions('  ', mine, catalog);
    expect(names(o.mine)).toEqual(['Barbell Curl', 'Cable Lateral Raise', 'Seated Cable Row']);
    expect(o.catalog.shown).toEqual([]);
    expect(o.create).toBeNull();
  });
  it('has no create row when one of yours has exactly that name, and tidies the name it offers', () => {
    expect(pickerOptions(' seated   cable row ', mine, []).create).toBeNull();
    expect(pickerOptions('  Cable   Fly ', mine, []).create).toBe('Cable Fly');
  });
  it('caps each group and says how many are left', () => {
    const many = Array.from({ length: 12 }, (_, i) => cat(`c:x:${i}`, `Press ${String(i).padStart(2, '0')}`));
    const o = pickerOptions('press', [], many, { max: 5 });
    expect(o.catalog.shown).toHaveLength(5);
    expect(o.catalog.hidden).toBe(7);
  });
  it('supplements: the same name from another brand is not a duplicate, and server results are not filtered again', () => {
    const supps = [{ id: 's1', name: 'Creatine', brand: 'NOW' }];
    const found = [cat('c:dsld:1', 'Creatine', 'NOW'), cat('c:dsld:2', 'Creatine', 'Optimum'), cat('c:dsld:3', 'Creatine Monohydrate Powder', 'Kaged')];
    const o = pickerOptions('creatine now', supps, found, { byBrand: true, serverFiltered: true });
    expect(names(o.mine)).toEqual(['Creatine']); // the brand counts when matching your own
    expect(o.catalog.shown.map(c => c.id)).toEqual(['c:dsld:2', 'c:dsld:3']);
  });
});

describe('pickerOptions also', () => {
  it('counts `also` items as yours for duplicates and the create row, without listing them', () => {
    const inSlot = [{ id: 's1', name: 'Creatine', brand: 'NOW', catalogId: 'c:dsld:1' }];
    const found = [cat('c:dsld:1', 'Creatine', 'NOW'), cat('c:dsld:2', 'Creatine', 'Optimum')];
    const o = pickerOptions('creatine', [], found, { byBrand: true, serverFiltered: true, also: inSlot });
    expect(o.mine.shown).toEqual([]);
    expect(o.catalog.shown.map(c => c.id)).toEqual(['c:dsld:2']);
    expect(o.create).toBeNull(); // already in the slot under that name
  });
});

describe('pickerKey', () => {
  it('trims, folds spaces and case, and copes with nothing', () => {
    expect(pickerKey('  Cable   Row ')).toBe('cable row');
    expect(pickerKey(undefined)).toBe('');
  });
});

describe('pickerOptions punctuation', () => {
  it('finds yours ignoring apostrophes and punctuation, brand first or last', () => {
    const mine = [{ id: 'a', name: 'Fish Oil Omega-3', brand: "Nature's Way" }];
    for (const q of ['natures way fish', 'fish nature\'s', 'omega 3', 'omega-3 natures'])
      expect(pickerOptions(q, mine, [], { byBrand: true }).mine.shown.map(m => m.id), q).toEqual(['a']);
  });
});
