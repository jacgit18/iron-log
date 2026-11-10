import { describe, expect, it } from 'vitest';
import { NUTRIENT_KEYS } from '../shared/nutrientKeys.js';
import { liveRows, microOfRows, nextFreeKey, rowsFromMicro } from './foodAmountRows.js';
import type { AmountRow } from './foodAmountRows.js';

// Brief type-food-amounts: rows to Micro (unit conversion, cap, zero, duplicates) and the rule for which rows survive a calorie change.
const row = (key: AmountRow['key'], amount: string, unit: AmountRow['unit'], filled?: boolean): AmountRow => ({ key, amount, unit, ...(filled ? { filled: true } : {}) });

describe('microOfRows', () => {
  it('stores each amount in the nutrient\'s table unit', () => {
    expect(microOfRows([row('vitaminB12', '0.01', 'mg')]).micro).toEqual({ vitaminB12: 10 });
    expect(microOfRows([row('vitaminB12', '1', 'mg')])).toEqual({ micro: undefined, left: ['Vitamin B12 1 mg is far above any food; left out.'] }); // 1000 mcg is past the 48 mcg cap (the brief's own example)
    expect(microOfRows([row('calcium', '500', 'mcg'), row('iron', '2.4', 'mg'), row('fiber', '3', 'g')]).micro).toEqual({ calcium: 0.5, iron: 2.4, fiber: 3 });
    expect(microOfRows([row('fiber', '500', 'mg')]).micro).toEqual({ fiber: 0.5 });
  });
  it('skips an empty or zero amount silently and has no field when nothing is left', () => {
    expect(microOfRows([row('zinc', '', 'mg'), row('iron', '0', 'mg'), row('copper', 'abc', 'mcg')])).toEqual({ micro: undefined, left: [] });
    expect(microOfRows([])).toEqual({ micro: undefined, left: [] });
  });
  it('says so for an amount over the cap and for a nutrient listed twice (in any unit), keeping the first', () => {
    const r = microOfRows([row('calcium', '99999', 'mg'), row('zinc', '5', 'mg'), row('zinc', '2000', 'mcg')]);
    expect(r.micro).toEqual({ zinc: 5 });
    expect(r.left).toEqual(['Calcium 99999 mg is far above any food; left out.', 'Zinc is listed twice; only the first is kept.']);
  });
  it('writes keys in table order whatever the row order', () => {
    expect(Object.keys(microOfRows([row('zinc', '1', 'mg'), row('calcium', '1', 'mg')]).micro!)).toEqual(['calcium', 'zinc']);
  });
});

describe('rowsFromMicro and nextFreeKey', () => {
  it('turns stored amounts into rows in table order, marked filled when they were not typed here', () => {
    expect(rowsFromMicro({ zinc: 2, calcium: 100 }, true)).toEqual([row('calcium', '100', 'mg', true), row('zinc', '2', 'mg', true)]);
    expect(rowsFromMicro(undefined, true)).toEqual([]);
    expect(rowsFromMicro({ iron: 1 }, false)).toEqual([row('iron', '1', 'mg')]);
  });
  it('offers the next nutrient with no row, and none when all 28 have one', () => {
    expect(nextFreeKey([row('calcium', '1', 'mg')])).toBe('thiamin');
    expect(nextFreeKey([])).toBe('thiamin');
    const all = rowsFromMicro(Object.fromEntries(NUTRIENT_KEYS.map(k => [k, 1])), false);
    expect(all).toHaveLength(28);
    expect(nextFreeKey(all)).toBeUndefined();
  });
});

describe('liveRows: the calorie-change rule', () => {
  const rows = [row('calcium', '99', 'mg', true), row('zinc', '2', 'mg')];
  it('keeps everything while calories are the number the filled rows came with', () => {
    expect(liveRows(rows, 640, 640)).toEqual({ rows, cleared: false });
    expect(liveRows(rows, 700, undefined)).toEqual({ rows, cleared: false });
  });
  it('drops the untouched filled rows when calories change and keeps the ones the person typed', () => {
    expect(liveRows(rows, 700, 640)).toEqual({ rows: [row('zinc', '2', 'mg')], cleared: true });
  });
  it('does not say cleared when there was nothing filled to clear', () => {
    expect(liveRows([row('zinc', '2', 'mg')], 700, 640)).toEqual({ rows: [row('zinc', '2', 'mg')], cleared: false });
  });
});
