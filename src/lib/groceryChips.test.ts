import { describe, expect, it } from 'vitest';
import type { GroceryItem } from '../types.ts';
import { ALL_CHIP, DETAILS_OPEN_FROM, asDropdown, chipGroups, chipOptionText, chipToValue, chipsOf, detailsStartOpen, haveCount, haveMonthText, hasNoPrice, resolveChip, showChips, storeChip, valueToChip } from './groceryChips.js';

const item = (id: string, store: string): GroceryItem => ({ id, n: id, store, qty: 1, cents: 100, every: true, out: false });
const groups = [
  { store: 'Costco', label: 'Costco', items: [item('a', 'Costco'), item('b', 'Costco'), item('c', 'Costco')] },
  { store: 'Aldi', label: 'Aldi', items: [item('d', 'Aldi')] },
  { store: 'Joe', label: 'Joe', items: [] },
];

describe('chipsOf', () => {
  it('says All with the total and one chip per store that has rows', () => {
    expect(chipsOf(groups)).toEqual([{ key: ALL_CHIP, label: 'All', count: 4 }, { key: 's:Costco', label: 'Costco', count: 3 }, { key: 's:Aldi', label: 'Aldi', count: 1 }]);
  });
  it('gives only All when nothing is left to get', () => {
    expect(chipsOf([])).toEqual([{ key: ALL_CHIP, label: 'All', count: 0 }]);
  });
  it('keeps Anywhere apart from All', () => {
    expect(storeChip('')).toBe('s:');
    expect(storeChip('')).not.toBe(ALL_CHIP);
  });
});

describe('resolveChip and chipGroups', () => {
  it('keeps a chip whose store still has rows and falls back to All otherwise', () => {
    expect(resolveChip('s:Aldi', groups)).toBe('s:Aldi');
    expect(resolveChip('s:Joe', groups)).toBe(ALL_CHIP);
    expect(resolveChip('s:Gone', groups)).toBe(ALL_CHIP);
  });
  it('shows every store for All and one store for a chip', () => {
    expect(chipGroups(groups, ALL_CHIP)).toHaveLength(3);
    expect(chipGroups(groups, 's:Costco').map(x => x.store)).toEqual(['Costco']);
  });
});

describe('showChips', () => {
  it('needs two stores to tell apart', () => {
    expect(showChips(chipsOf(groups))).toBe(true);
    expect(showChips(chipsOf([groups[0]!]))).toBe(false);
  });
});

describe('detailsStartOpen', () => {
  it('opens above 700 px and closes on a phone when nothing was chosen', () => {
    expect(detailsStartOpen('auto', DETAILS_OPEN_FROM)).toBe(true);
    expect(detailsStartOpen('auto', DETAILS_OPEN_FROM - 1)).toBe(false);
    expect(detailsStartOpen('auto', 1440)).toBe(true);
  });
  it('lets a choice beat the width', () => {
    expect(detailsStartOpen('open', 390)).toBe(true);
    expect(detailsStartOpen('closed', 1920)).toBe(false);
  });
});

describe('hasNoPrice', () => {
  it('is true only for a line with neither a price nor pack prices', () => {
    expect(hasNoPrice({})).toBe(true);
    expect(hasNoPrice({ cents: 0 })).toBe(false);
    expect(hasNoPrice({ prices: [100] })).toBe(false);
  });
});

describe('Inventory counts', () => {
  it('counts the items you have in a store', () => {
    expect(haveCount(groups[0]!.items, i => i.id !== 'b')).toBe(2);
    expect(haveCount([], () => true)).toBe(0);
  });
  it('says how many of the items you have this month in the rail', () => {
    expect(haveMonthText(2, 5)).toBe('2 of 5 items this month');
    expect(haveMonthText(1, 1)).toBe('1 of 1 item this month');
  });
  it('makes one chip per store with its item count', () => {
    expect(chipsOf(groups).map(c => c.count)).toEqual([4, 3, 1]);
  });
});

describe('asDropdown', () => {
  const n = (k: number) => Array.from({ length: k }, (_, i) => ({ key: `k${i}`, label: `L${i}`, count: i }));
  it('keeps chips for four options or fewer (All plus up to 3 stores)', () => {
    expect(asDropdown(n(1))).toBe(false);
    expect(asDropdown(n(3))).toBe(false);
    expect(asDropdown(n(4))).toBe(false);
  });
  it('becomes a dropdown for five options or more (All plus 4 stores)', () => {
    expect(asDropdown(n(5))).toBe(true);
    expect(asDropdown(n(9))).toBe(true);
  });
});

describe('dropdown mapping', () => {
  it('writes counts in brackets', () => {
    expect(chipOptionText({ key: ALL_CHIP, label: 'All', count: 12 })).toBe('All (12)');
    expect(chipOptionText({ key: 's:Aldi', label: 'Aldi', count: 1 })).toBe('Aldi (1)');
  });
  it('maps All to the empty value and back, and leaves stores alone', () => {
    expect(chipToValue(ALL_CHIP)).toBe('');
    expect(valueToChip('')).toBe(ALL_CHIP);
    expect(valueToChip(chipToValue('s:Aldi'))).toBe('s:Aldi');
    expect(valueToChip(chipToValue('s:'))).toBe('s:'); // Anywhere is not All
  });
});
