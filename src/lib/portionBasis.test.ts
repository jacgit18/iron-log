import { describe, expect, it } from 'vitest';
import { canSaveToRecipe, portionAmounts, portionBasis, portionMaxFor, portionValues, portionWords, recipeSaveBlock, shownPer, stepPortionCount, totalsAt } from './portionBasis.js';
import { rowsFromMicro } from './foodAmountRows.js';
import { ateEntry } from './dietLog.js';
import { normDietEntry } from '../shared/diet.js';
import type { DietEntry } from '../types.ts';

// Per-portion basis of an eaten item (brief portion-scaled-micros). Done-when 1 to 5.
const logged: DietEntry = { id: 'a', d: '2026-11-14', n: 'Oats', kcal: 600, p: 30, c: 90, f: 15, x: 2.5, micro: { calcium: 300, iron: 6 } };

describe('portionBasis', () => {
  it('divides the stored totals by the stored portion', () => {
    const b = portionBasis(logged);
    expect(b).toMatchObject({ x: 2.5, recorded: true, per: { kcal: 240, p: 12, c: 36, f: 6, micro: { calcium: 120, iron: 2.4 } } });
  });
  it('an entry logged before this change opens as 1 portion of its logged numbers, not recorded', () => {
    const { x: _x, ...old } = logged;
    const b = portionBasis(old);
    expect(b).toMatchObject({ x: 1, recorded: false, per: { kcal: 600, p: 30, micro: { calcium: 300, iron: 6 } } });
  });
  it('has no carbs, fat or amounts when the entry has none', () => {
    expect(portionBasis({ kcal: 100, p: 5, x: 2 }).per).toEqual({ kcal: 50, p: 2.5 });
  });
});

describe('totalsAt: changing the portion rescales everything', () => {
  const per = { kcal: 240, p: 12, c: 36 as number | null, f: 6 as number | null, micro: { calcium: 120, iron: 2.4 } };
  it('scales calories, macros and amounts together', () => {
    expect(totalsAt(per, 2)).toEqual({ kcal: 480, p: 24, c: 72, f: 12, micro: { calcium: 240, iron: 4.8 } });
    expect(totalsAt(per, 0.5)).toEqual({ kcal: 120, p: 6, c: 18, f: 3, micro: { calcium: 60, iron: 1.2 } });
  });
  it('an item with no amounts typed per portion saves doubled amounts at 2 portions', () => {
    expect(totalsAt({ kcal: 300, p: 10, c: null, f: null, micro: { vitaminC: 12 } }, 2)?.micro).toEqual({ vitaminC: 24 });
  });
  it('is null when a total is out of range, and drops an amount over its cap', () => {
    expect(totalsAt({ kcal: 6000, p: 10, c: null, f: null }, 2)).toBeNull();
    expect(totalsAt({ kcal: 100, p: 1, c: null, f: null, micro: { calcium: 1e9 } }, 2)?.micro).toBeNull();
    expect(totalsAt(per, 0)).toBeNull();
  });
});

describe('portionValues: what the sheet saves', () => {
  const basis = portionBasis({ kcal: 520, p: 41, x: 1.5, micro: { iron: 3 } }); // 346.67 kcal a portion
  const shown = shownPer(basis.per);
  it('a per-portion box left as shown keeps the exact number, so a portion change does not drift by rounding', () => {
    const v = portionValues({ shown, typed: shown, exact: basis.per, x: 1.5, microPer: basis.per.micro ?? null });
    expect(v.totals).toMatchObject({ kcal: 520, p: 41 });
  });
  it('changing the portion never drops amounts', () => {
    const v = portionValues({ shown, typed: shown, exact: basis.per, x: 3, microPer: basis.per.micro ?? null });
    expect(v.totals).toMatchObject({ kcal: 1040, micro: { iron: 6 } });
  });
  it('a typed per-portion number replaces the exact one', () => {
    const v = portionValues({ shown, typed: { ...shown, kcal: '300' }, exact: basis.per, x: 2, microPer: null });
    expect(v.totals).toMatchObject({ kcal: 600 });
    expect(v.totals?.micro).toBeNull();
  });
  it('blank carbs and fat mean none', () => {
    expect(portionValues({ shown, typed: shown, exact: basis.per, x: 1, microPer: null }).totals).toMatchObject({ c: null, f: null });
  });
});

describe('portionAmounts: the calorie rule and exact amounts (review of PR 984)', () => {
  const basis = portionBasis({ kcal: 300, p: 9, x: 3, micro: { calcium: 100, iron: 6 } }); // calcium 33.333 a portion
  const rows = rowsFromMicro(basis.per.micro, true);
  it('rows left as shown keep the exact amounts: open and save at 3 portions is still 100, not 99.999', () => {
    const a = portionAmounts(rows, String(Math.round(basis.per.kcal)), basis);
    expect(a.cleared).toBe(false);
    expect(a.microPer).toEqual(basis.microExact);
    const shown = shownPer(basis.per);
    expect(portionValues({ shown, typed: shown, exact: basis.per, x: 3, microPer: a.microPer }).totals?.micro).toEqual({ calcium: 100, iron: 6 });
  });
  it('changing the portion alone never drops the rows', () => {
    expect(portionAmounts(rows, String(Math.round(basis.per.kcal)), basis).rows).toHaveLength(2);
  });
  it('changing the per-portion calories drops the untouched rows and says so', () => {
    const a = portionAmounts(rows, '120', basis);
    expect(a.rows).toEqual([]);
    expect(a.cleared).toBe(true);
    expect(a.microPer).toBeNull();
  });
  it('a row typed or edited here stays through a calorie change and is what is saved', () => {
    const typed = [{ key: 'iron' as const, amount: '4', unit: 'mg' as const }, ...rows.filter(r => r.key === 'calcium')];
    const a = portionAmounts(typed, '120', basis);
    expect(a.rows).toEqual([typed[0]]);
    expect(a.microPer).toEqual({ iron: 4 });
    const edited = rows.map(r => (r.key === 'iron' ? { key: r.key, amount: '5', unit: r.unit } : r));
    expect(portionAmounts(edited, String(Math.round(basis.per.kcal)), basis).microPer).toEqual({ calcium: 33.333, iron: 5 });
  });
});

describe('stepper helpers', () => {
  it('portionMaxFor lowers the top until the totals fit one entry', () => {
    expect(portionMaxFor({ kcal: 200, p: 5, c: null, f: null })).toBe(10);
    expect(portionMaxFor({ kcal: 2500, p: 5, c: null, f: null })).toBe(3.5); // 3.5 x 2500 = 8750; 4 x 2500 = 10000 > 9999
  });
  it('steps in halves and stays in range', () => {
    expect(stepPortionCount(1, 1, 10)).toBe(1.5);
    expect(stepPortionCount(0.5, -1, 10)).toBe(0.5);
    expect(stepPortionCount(10, 1, 10)).toBe(10);
  });
  it('words', () => { expect(portionWords(1)).toBe('1 portion'); expect(portionWords(2.5)).toBe('2.5 portions'); });
});

describe('canSaveToRecipe: the tick', () => {
  it('shows only for an existing recipe with no amounts', () => {
    expect(canSaveToRecipe(undefined)).toBe(false);
    expect(canSaveToRecipe({})).toBe(true);
    expect(canSaveToRecipe({ micro: {} })).toBe(true);
    expect(canSaveToRecipe({ micro: { iron: 1 } })).toBe(false);
  });
  it('is hidden when the portion was not recorded: one portion would be a guess, and the recipe could get doubled amounts', () => {
    expect(canSaveToRecipe({}, false)).toBe(false);
    expect(canSaveToRecipe({}, true)).toBe(true);
  });
  it('names why it cannot be saved: a gone recipe is not "already has amounts"', () => {
    expect(recipeSaveBlock(undefined)).toBe('That recipe is gone.');
    expect(recipeSaveBlock({ micro: { iron: 1 } })).toBe('That recipe already has amounts.');
    expect(recipeSaveBlock({}, false)).toBe('The portion was not recorded.');
    expect(recipeSaveBlock({})).toBeNull();
    expect(recipeSaveBlock({ micro: {} })).toBeNull();
  });
});

describe('the portion is stored', () => {
  it('ateEntry stores the servings as x, and normDietEntry keeps it, cleans it, or drops it', () => {
    const made = ateEntry({ id: 'r', n: 'Oats', kcal: 300, p: 10 }, 1.5, '2026-11-14', '2026-11-14');
    expect('entry' in made && made.entry.x).toBe(1.5);
    const base = { id: 'a', d: '2026-11-14', n: 'x', kcal: 1, p: 1 };
    expect(normDietEntry({ ...base, x: 2 })?.x).toBe(2);
    expect(normDietEntry({ ...base, x: 2.456 })?.x).toBe(2.46);
    expect(normDietEntry({ ...base, x: 0.1 })).not.toHaveProperty('x');
    expect(normDietEntry({ ...base, x: 100 })).not.toHaveProperty('x');
    expect(normDietEntry({ ...base, x: 'two' })).not.toHaveProperty('x');
  });
});
