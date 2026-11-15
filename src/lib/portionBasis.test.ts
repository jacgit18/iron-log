import { describe, expect, it } from 'vitest';
import { canSaveToRecipe, entryTotalsAt, portionAmounts, portionBasis, portionMaxFor, portionValues, portionWords, recipeSaveBlock, shownPer, stepEntryCount, stepPortionCount, totalsAt } from './portionBasis.js';
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

/* ---------- Less and More on an eaten entry (brief nutrition-log-first-portion-row; one source with the Edit sheet, ADR 123) ---------- */
const eat = (o: Partial<DietEntry> = {}): DietEntry => ({ id: 'e1', d: '2026-11-14', n: 'Rice', kcal: 520, p: 42, c: 60, f: 12, ...o });
/** The entry at x portions, as the slice stores it (numbers scaled, x recorded), or null. */
const at = <T extends DietEntry>(en: T, x: number, max?: number): T | null => {
  const t = entryTotalsAt(en, x, max);
  if (!t) return null;
  const { c: _c, f: _f, micro: _m, ...rest } = en;
  return { ...rest, kcal: t.kcal, p: t.p, ...(t.c !== null ? { c: t.c } : {}), ...(t.f !== null ? { f: t.f } : {}), ...(t.micro ? { micro: t.micro } : {}), x: t.x } as T;
};

describe('entryTotalsAt: the entry\'s own numbers scaled by new count over old count', () => {
  it('an entry with no count reads as 1 and doubles at 2', () => {
    expect(portionBasis(eat()).x).toBe(1);
    expect(at(eat(), 2)).toEqual(eat({ kcal: 1040, p: 84, c: 120, f: 24, x: 2 }));
  });
  it('uses the stored count as the base, not 1', () => {
    expect(at(eat({ kcal: 780, p: 63, c: 90, f: 18, x: 1.5 }), 1)).toMatchObject({ kcal: 520, p: 42, c: 60, f: 12, x: 1 });
  });
  it('scales micro and drops nothing; leaves out carbs and fat the entry never had', () => {
    const r = at(eat({ c: undefined, f: undefined, micro: { calcium: 100 } }), 1.5)!;
    expect(r.micro).toEqual({ calcium: 150 });
    expect('c' in r).toBe(false); expect('f' in r).toBe(false);
  });
  it('keeps other fields (id, day, name, from, hour)', () => {
    expect(at(eat({ from: 'r1', t: 9 }), 2)).toMatchObject({ id: 'e1', d: '2026-11-14', n: 'Rice', from: 'r1', t: 9 });
  });
});

describe('limits', () => {
  it('the limit is the Edit sheet\'s (10), and a count scales by what is stored (two decimals)', () => {
    expect(at(eat({ kcal: 10, p: 1 }), 10.5)).toBeNull();
    expect(at(eat({ kcal: 10, p: 1 }), 10)).not.toBeNull();
    expect(at(eat({ kcal: 300 }), 1.333)).toMatchObject({ kcal: 399, x: 1.33 });
  });
  it('refuses a step that would drop an amount over its cap', () => {
    expect(at(eat({ micro: { calcium: 15000 } }), 2)).toBeNull();
    expect(at(eat({ micro: { calcium: 100 } }), 2)).not.toBeNull();
  });
  it('refuses below half a portion and above the limit', () => {
    expect(at(eat(), 0.25)).toBeNull();
    expect(at(eat(), 3, 2.5)).toBeNull();
    expect(at(eat(), 2.5, 2.5)).not.toBeNull();
    expect(at(eat({ kcal: 10, p: 1 }), 100)).toBeNull();
    expect(at(eat(), NaN)).toBeNull();
  });
  it('never makes calories above 9,999', () => {
    const big = eat({ kcal: 2000, p: 10, c: undefined, f: undefined });
    expect(entryTotalsAt(big, 5)).toBeNull(); // 10,000 kcal
    expect(entryTotalsAt(big, 4.5)!.kcal).toBe(9000);
  });
  it('Less stops at 0.5 and More at the ceiling', () => {
    expect(stepEntryCount(eat({ x: 0.5 }), -1)).toBeNull();
    expect(stepEntryCount(eat({ x: 1 }), -1)).toBe(0.5);
    expect(stepEntryCount(eat({ x: 1 }), 1)).toBe(1.5);
    expect(stepEntryCount(eat(), 1, 1)).toBeNull();
    expect(stepEntryCount(eat({ kcal: 9000, p: 10, x: 4.5 }), 1)).toBeNull();
  });
});

describe('rounding rule: Less then More returns the starting numbers within 1 kcal', () => {
  it('holds for whole kcal from 1 to 3000 (every 7th, plus the edges) and every half step, from either direction', () => {
    let worst = 0; // the largest gap seen, asserted once (60,000 expects would be slow)
    const gap = (start: DietEntry, to: number | null, x: number) => {
      if (to === null) return;
      const back = at(at(start, to)!, x)!;
      worst = Math.max(worst, Math.abs(back.kcal - start.kcal));
    };
    for (let kcal = 1; kcal <= 3000; kcal += kcal === 1 ? 6 : 7) {
      for (let x = 0.5; x <= 10; x += 0.5) {
        const start = eat({ kcal: Math.round(kcal * x) || 1, p: 10, c: undefined, f: undefined, x });
        if (start.kcal > 9999) continue; // not a storable entry; the cap itself (9,999) is now included
        gap(start, stepEntryCount(start, -1), x);
        gap(start, stepEntryCount(start, 1), x);
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
  });
  it('a run of Less and More taps drifts by at most 1 kcal per tap', () => {
    let cur = eat({ kcal: 521 });
    for (let tap = 1; tap <= 10; tap++) {
      cur = at(cur, stepEntryCount(cur, tap % 2 ? -1 : 1)!)!;
      expect(Math.abs(cur.kcal - 521 * portionBasis(cur).x)).toBeLessThanOrEqual(tap);
    }
  });
  it('a worked case: 521 kcal at 1 portion, Less then More', () => {
    const less = at(eat({ kcal: 521 }), 0.5)!;
    expect(less.kcal).toBe(261);
    expect(at(less, 1)!.kcal).toBe(522);
  });
});

describe('Less above the food\'s limit', () => {
  it('Less works on an entry above the limit; More does not', () => {
    const over = eat({ kcal: 1200, p: 10, c: undefined, f: undefined, x: 8 });
    expect(stepEntryCount(over, -1, 5)).toBe(7.5);
    expect(stepEntryCount(over, 1, 5)).toBeNull();
  });
});

describe('the 9,999 kcal cap', () => {
  it('Less then More from 9,999 kcal at 9 portions comes back to 9,999, not a refusal', () => {
    const top = eat({ kcal: 9999, p: 10, c: undefined, f: undefined, x: 9 });
    const less = at(top, 8.5)!;
    expect(less.kcal).toBe(9444);
    expect(at(less, 9)!.kcal).toBe(9999);
  });
  it('a count that is really over the cap is still refused', () => {
    expect(at(eat({ kcal: 9000, p: 10, c: undefined, f: undefined, x: 4.5 }), 5)).toBeNull();
  });
});

describe('one source for Less and More (PR 995 review)', () => {
  it('Less is allowed above the food\'s limit, and above the ceiling an entry already has; More is not', () => {
    const over = eat({ kcal: 1200, p: 10, c: undefined, f: undefined, x: 8 });
    expect(entryTotalsAt(over, 7.5, 5)).toMatchObject({ kcal: 1125, x: 7.5 }); // refused before: 7.5 is above the limit 5
    expect(entryTotalsAt(over, 8.5, 5)).toBeNull();
    const synced = eat({ kcal: 120, p: 1, c: undefined, f: undefined, x: 12 }); // the cleaner accepts up to 99
    expect(stepEntryCount(synced, -1)).toBe(11.5);
    expect(stepEntryCount(synced, 1)).toBeNull();
  });
  it('a stored count is what the cleaner accepts, so what is stored is what was scaled by', () => {
    const t = entryTotalsAt(eat({ kcal: 300, c: undefined, f: undefined }), 1.333)!;
    expect(t.x).toBe(1.33);
    expect(normDietEntry({ ...eat(), kcal: t.kcal, p: t.p, x: t.x })).toMatchObject({ kcal: t.kcal, x: 1.33 });
  });
  it('Less then More keeps every amount (rounded display never feeds the scale)', () => {
    const start = eat({ kcal: 900, c: undefined, f: undefined, micro: { calcium: 100, iron: 3 }, x: 3 });
    const back = at(at(start, 2.5)!, 3)!;
    expect(back.micro).toEqual({ calcium: 100, iron: 3 });
  });
  it('scales from the entry\'s own one-portion basis for any recorded count', () => {
    expect(entryTotalsAt(eat({ kcal: 780, p: 63, c: 90, f: 18, x: 1.5 }), 3)).toMatchObject({ kcal: 1560, p: 126, c: 180, f: 36, x: 3 });
  });
});

describe('Less then More (review of PR 999)', () => {
  it('Less then More is exact whenever whole kcal can come back, and off by at most 1 when they cannot (521 at 1 portion)', () => {
    let impossible = 0;
    for (let kcal = 1; kcal <= 400; kcal++) {
      for (const [x, to] of [[1, 0.5], [1.5, 1], [2, 1.5], [3, 2.5], [1.5, 0.5], [2, 1]] as const) {
        const less = at(eat({ kcal, p: 10, c: undefined, f: undefined, x }), to);
        if (!less) continue; // under 1 kcal: refused
        const gap = Math.abs(at(less, x)!.kcal - kcal), exact = (kcal / x) * to;
        const possible = [Math.floor(exact), Math.ceil(exact)].some(v => v >= 1 && Math.round((v / to) * x) === kcal);
        if (possible) expect(gap).toBe(0); else { impossible++; expect(gap).toBe(1); }
      }
    }
    expect(impossible).toBeGreaterThan(0);
  });
  it('More then Less always returns the starting numbers', () => {
    for (let kcal = 1; kcal <= 600; kcal++) for (const [x, to] of [[0.5, 1], [1, 1.5], [1, 2], [2.5, 3]] as const) {
      const start = eat({ kcal, p: 10, c: undefined, f: undefined, x });
      if (!at(start, to)) continue;
      expect(at(at(start, to)!, x)!.kcal).toBe(kcal);
    }
  });
  it('grams come back the same way (one decimal)', () => {
    for (let p = 1; p <= 200; p++) {
      const start = eat({ kcal: 500, p: p / 10, c: undefined, f: undefined, x: 3 });
      const back = at(at(start, 2.5)!, 3)!;
      expect(Math.abs(back.p - start.p)).toBeLessThanOrEqual(0.1 + 1e-9);
    }
  });
  it('the sheet\'s most portions agrees with the row at the 9,999 kcal cap', () => {
    const per = { kcal: 9999.4 / 9, p: 10, c: null, f: null }; // 9 portions is 9,999.4 kcal, 9.5 is over
    expect(portionMaxFor(per)).toBe(9);
    const exactCap = { kcal: 9999.5 / 9, p: 10, c: null, f: null }; // 9,999.5 kcal at 9 portions is the cap, not a refusal
    expect(totalsAt(exactCap, 9)!.kcal).toBe(9999);
    expect(totalsAt({ kcal: 10000 / 9, p: 10, c: null, f: null }, 9)).toBeNull();
  });
});
