import { describe, expect, it } from 'vitest';
import type { SupplementItem } from '../types.ts';
import { chipTap, filterRows, groupSupplements, hasBothSources, perDay, rowCounts, rowSub } from './supplementList.js';

const it0 = (id: string, n: string, slot: SupplementItem['slot'], extra: Partial<SupplementItem> = {}): SupplementItem => ({ id, n, slot, ...extra });
const ITEMS: SupplementItem[] = [
  it0('n1', 'Omega-3', 'night', { brand: 'Nordic Naturals', dose: '2 softgels', catalogId: 'c1' }),
  it0('d3', 'Vitamin D3', 'morning', { dose: '2000 IU' }),
  it0('m1', 'Omega-3', 'morning', { brand: 'Nordic Naturals', dose: '2 softgels', catalogId: 'c1' }),
  it0('z', 'Zinc', '', { brand: 'Thorne' }),
  it0('c', 'Creatine', 'noon', { dose: '5 g' }),
];

describe('groupSupplements', () => {
  const rows = groupSupplements(ITEMS);
  it('folds the entries of one name and brand into one row with its times in order', () => {
    expect(rows.filter(r => r.n === 'Omega-3')).toHaveLength(1);
    expect(rows.find(r => r.n === 'Omega-3')!.slots).toEqual(['morning', 'night']);
  });
  it('lists by first time of day, Library only last, keeping store order inside a group', () => {
    expect(rows.map(r => r.n)).toEqual(['Omega-3', 'Vitamin D3', 'Creatine', 'Zinc']);
  });
  it('points the row at the entry of its first time, or the library-only entry', () => {
    expect(rows.find(r => r.n === 'Omega-3')!.id).toBe('m1');
    expect(rows.find(r => r.n === 'Zinc')!.id).toBe('z');
  });
  it('keeps two brands of one name apart and counts every row once', () => {
    const two = groupSupplements([it0('a', 'Zinc', '', { brand: 'Thorne' }), it0('b', 'Zinc', 'morning', { brand: 'Now' })]);
    expect(two).toHaveLength(2);
    expect(rowCounts(rows)).toEqual({ all: 4, scheduled: 3, library: 1 });
  });
  it('takes the note any entry has and lists each different dose once', () => {
    const r = groupSupplements([it0('a', 'X', 'morning', { dose: '1 g' }), it0('b', 'X', 'night', { dose: '2 g', note: 'with food' }), it0('c', 'X', 'noon', { dose: '2 g' })])[0];
    expect(r.dose).toBe('1 g / 2 g'); expect(r.note).toBe('with food');
  });
});

describe('filterRows', () => {
  const rows = groupSupplements(ITEMS);
  const f = (o: Partial<Parameters<typeof filterRows>[1]>) => filterRows(rows, { q: '', filter: 'all', source: '', ...o }).map(r => r.n);
  it('searches name and brand, every word', () => { expect(f({ q: 'nordic omega' })).toEqual(['Omega-3']); expect(f({ q: 'thorne' })).toEqual(['Zinc']); expect(f({ q: 'nothing here' })).toEqual([]); });
  it('splits Scheduled and Library only', () => { expect(f({ filter: 'scheduled' })).toHaveLength(3); expect(f({ filter: 'library' })).toEqual(['Zinc']); });
  it('filters by source, catalog or typed in', () => { expect(f({ source: 'library' })).toEqual(['Omega-3']); expect(f({ source: 'custom' })).toHaveLength(3); });
  it('knows when both sources exist', () => { expect(hasBothSources(rows)).toBe(true); expect(hasBothSources(groupSupplements([ITEMS[1]]))).toBe(false); });
});

describe('row words', () => {
  const rows = groupSupplements(ITEMS);
  it('says what a row holds', () => { expect(rowSub(rows[0])).toBe('Nordic Naturals · 2 softgels'); expect(rowSub(groupSupplements([it0('q', 'Q', '')])[0])).toBe('No dose or note'); });
  it('says how often', () => { expect(perDay(rows[0])).toBe('2 a day'); expect(perDay(rows[3])).toBe('Library only'); });
});

describe('chipTap', () => {
  it('turns a time on with the existing times kept', () => {
    expect(chipTap(ITEMS, 'd3', 'night')).toEqual({ kind: 'save', times: [{ slot: 'morning', portion: 1 }, { slot: 'night', portion: 1 }] });
  });
  it('turns a time off when another stays', () => {
    expect(chipTap(ITEMS, 'm1', 'night')).toEqual({ kind: 'save', times: [{ slot: 'morning', portion: 1 }] });
  });
  it('schedules a library-only entry at the tapped time', () => {
    expect(chipTap(ITEMS, 'z', 'noon')).toEqual({ kind: 'save', times: [{ slot: 'noon', portion: 1 }] });
  });
  it('removes the entry when the last time is turned off, which returns it to the library', () => {
    expect(chipTap(ITEMS, 'd3', 'morning')).toEqual({ kind: 'remove', id: 'd3' });
  });
  it('does nothing for an unknown id', () => expect(chipTap(ITEMS, 'nope', 'noon')).toBeNull());
});
