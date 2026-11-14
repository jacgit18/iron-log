import { describe, expect, it } from 'vitest';
import { ownAmounts, recipeMicroToSave } from './recipeOwnAmounts.js';
import { rowsFromMicro } from './foodAmountRows.js';
import { servingNumbers } from './dietLog.js';
import type { AmountRow } from './foodAmountRows.js';

const typed: AmountRow[] = [{ key: 'iron', amount: '4', unit: 'mg' }, { key: 'vitaminB12', amount: '1.2', unit: 'mcg' }];

describe('recipe form amount rows', () => {
  it('turns typed rows into per-serving amounts in table units', () => {
    const r = ownAmounts([{ key: 'vitaminB12', amount: '0.002', unit: 'mg' }], '500', undefined);
    expect(r.micro?.vitaminB12).toBeCloseTo(2);
  });
  it('logging 1.5 servings scales the saved amounts', () => {
    const micro = ownAmounts(typed, '500', undefined).micro;
    const n = servingNumbers({ kcal: 500, p: 30, micro }, 1.5)!;
    expect(n.micro?.iron).toBeCloseTo(6);
    expect(n.micro?.vitaminB12).toBeCloseTo(1.8);
  });
  it('drops untouched filled rows when calories change, keeps typed ones', () => {
    const rows = [...rowsFromMicro({ iron: 3 }, true), ...typed.slice(1)];
    const r = ownAmounts(rows, '600', 500);
    expect(r.cleared).toBe(true);
    expect(r.micro).toEqual({ vitaminB12: 1.2 });
  });
  it('keeps filled rows while calories match', () => {
    const r = ownAmounts(rowsFromMicro({ iron: 3 }, true), '500', 500);
    expect(r.cleared).toBe(false);
    expect(r.micro).toEqual({ iron: 3 });
  });
  it('a meal built from parts saves the roll-up and ignores rows', () => {
    expect(recipeMicroToSave({ fromParts: true, rolled: { iron: 2 }, rows: typed, kcalText: '500', kcalFrom: undefined })).toEqual({ iron: 2 });
    expect(recipeMicroToSave({ fromParts: true, rolled: undefined, rows: typed, kcalText: '500', kcalFrom: undefined })).toBeUndefined();
  });
  it('a recipe on its own numbers saves the rows; no rows saves none', () => {
    expect(recipeMicroToSave({ fromParts: false, rolled: undefined, rows: typed, kcalText: '500', kcalFrom: undefined })?.iron).toBe(4);
    expect(recipeMicroToSave({ fromParts: false, rolled: undefined, rows: [], kcalText: '500', kcalFrom: undefined })).toBeUndefined();
  });
  it('names a row that is listed twice', () => {
    expect(ownAmounts([typed[0]!, typed[0]!], '500', undefined).left).toHaveLength(1);
  });
});
