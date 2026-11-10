import { describe, expect, it } from 'vitest';
import { NUTRIENT_KEYS } from './nutrientKeys.js';
import { NUTRIENT_LIMITS } from '../lib/nutrientLimits.js';
import { NUTRIENT_TARGETS } from '../lib/nutrientTargets.js';
import { MICRO_MAX, MICRO_UNIT, cleanMicro, offMicro, scaleMicro, usdaMicro, withMicro } from './foodMicro.js';

describe('the unit and cap tables', () => {
  it('cover every nutrient, in its table unit, at ten times the adult upper limit or the targets table cap', () => {
    expect(Object.keys(MICRO_UNIT)).toEqual([...NUTRIENT_KEYS]);
    for (const l of NUTRIENT_LIMITS) {
      expect(MICRO_UNIT[l.key], l.key).toBe(l.unit);
      expect(MICRO_MAX[l.key], l.key).toBe(l.upper * 10);
    }
    for (const t of NUTRIENT_TARGETS) {
      expect(MICRO_UNIT[t.key], t.key).toBe(t.unit);
      expect(MICRO_MAX[t.key], t.key).toBe(t.cap);
    }
  });
});

describe('cleanMicro', () => {
  it('keeps known keys with a positive amount in the table order, three decimals', () => {
    expect(cleanMicro({ zinc: 2.12345, calcium: 120 })).toEqual({ calcium: 120, zinc: 2.123 });
    expect(Object.keys(cleanMicro({ zinc: 1, calcium: 1 })!)).toEqual(['calcium', 'zinc']);
  });
  it('drops unknown keys, zero, negative, text, not-a-number and an over-the-cap amount', () => {
    expect(cleanMicro({ lutein: 5, iron: 0, zinc: -1, calcium: '5', copper: NaN, magnesium: 3501 })).toBeNull();
    expect(cleanMicro({ iron: 450, magnesium: 3500 })).toEqual({ iron: 450, magnesium: 3500 });
  });
  it('is null for anything that is not an object, or when nothing is left', () => {
    for (const v of [null, undefined, 5, 'x', [], {}]) expect(cleanMicro(v)).toBeNull();
  });
});

describe('scaleMicro', () => {
  it('scales each amount and drops what the scale pushes over the cap', () => {
    expect(scaleMicro({ calcium: 100, iron: 2 }, 1.5)).toEqual({ calcium: 150, iron: 3 });
    expect(scaleMicro({ iron: 300 }, 2)).toBeUndefined();
  });
  it('gives nothing for no micro or a bad factor', () => {
    expect(scaleMicro(undefined, 1)).toBeUndefined();
    expect(scaleMicro({ iron: 1 }, 0)).toBeUndefined();
    expect(withMicro(undefined)).toEqual({});
    expect(withMicro({ iron: 1 })).toEqual({ micro: { iron: 1 } });
  });
});

describe('usdaMicro', () => {
  const a = (o: Record<string, number>) => new Map(Object.entries(o));
  it('maps nutrient numbers to our keys and units (copper mg to mcg, folate DFE before total)', () => {
    expect(usdaMicro(a({ '301': 120, '303': 1.5, '312': 0.2, '435': 80, '417': 70, '320': 40, '401': 12 }))).toEqual({ calcium: 120, copper: 200, folate: 80, iron: 1.5, vitaminA: 40, vitaminC: 12 });
  });
  it('uses total folate when DFE is missing, and converts vitamin D from IU only when mcg is missing', () => {
    expect(usdaMicro(a({ '417': 70 }))).toEqual({ folate: 70 });
    expect(usdaMicro(a({ '324': 400 }))).toEqual({ vitaminD: 10 });
    expect(usdaMicro(a({ '324': 400, '328': 5 }))).toEqual({ vitaminD: 5 });
  });
  it('maps the nutrients with no upper limit: potassium and sodium in mg, vitamin K and B12 in mcg, fiber in g', () => {
    expect(usdaMicro(a({ '306': 420, '418': 0.5, '430': 40, '291': 2.6, '307': 15 }))).toEqual({ potassium: 420, vitaminB12: 0.5, vitaminK: 40, fiber: 2.6, sodium: 15 });
  });
  it('ignores vitamin A in IU and the nutrients it does not map, and is undefined when none match', () => {
    expect(usdaMicro(a({ '318': 5000, '208': 100, '203': 3 }))).toBeUndefined();
  });
});

describe('offMicro', () => {
  it('turns grams per 100 g into mg and mcg, numbers or text', () => {
    expect(offMicro({ calcium_100g: 0.12, iron_100g: '0.0015', 'vitamin-d_100g': 0.000005, 'vitamin-pp_100g': 0.004, 'vitamin-b9_100g': 0.00008 })).toEqual({ calcium: 120, folate: 80, iron: 1.5, niacin: 4, vitaminD: 5 });
  });
  it('turns the nutrients with no upper limit into mg, mcg and g (fiber stays in grams)', () => {
    expect(offMicro({ potassium_100g: 0.4, 'vitamin-b12_100g': 0.0000005, 'vitamin-k_100g': 0.00004, fiber_100g: 2.6, sodium_100g: 0.015 })).toEqual({ potassium: 400, vitaminB12: 0.5, vitaminK: 40, fiber: 2.6, sodium: 15 });
  });
  it('drops zero, blank, negative and implausible amounts, and is undefined with nothing left', () => {
    expect(offMicro({ calcium_100g: 0, iron_100g: '', zinc_100g: -1, magnesium_100g: 99 })).toBeUndefined(); // 99 g magnesium is far over the cap
    expect(offMicro(null)).toBeUndefined();
    expect(offMicro({ proteins_100g: 3 })).toBeUndefined();
  });
});

// Brief supplement-more-nutrients: thiamin, riboflavin, biotin, pantothenic acid, choline, chromium, molybdenum, manganese.
describe('the eight added nutrients in the vendor maps', () => {
  const a = (o: Record<string, number>) => new Map(Object.entries(o));
  it('USDA numbers 404, 405, 416, 410, 421, 1096, 1102, 315 carry in the table unit', () => {
    expect(usdaMicro(a({ '404': 0.2, '405': 3.4, '416': 30.8, '410': 7.1, '421': 426, '1096': 2, '1102': 104, '315': 0.36 }))).toEqual({
      choline: 426, manganese: 0.36, molybdenum: 104, biotin: 30.8, chromium: 2, pantothenicAcid: 7.1, riboflavin: 3.4, thiamin: 0.2,
    });
  });
  it('Open Food Facts vitamin-b1, vitamin-b2, biotin, pantothenic-acid, choline, chromium, molybdenum, manganese (grams per 100 g) convert to mg or mcg', () => {
    expect(offMicro({ 'vitamin-b1_100g': 0.0012, 'vitamin-b2_100g': '0.0013', biotin_100g: 0.00003, 'pantothenic-acid_100g': 0.005, choline_100g: 0.4, chromium_100g: 0.000035, molybdenum_100g: 0.000045, manganese_100g: 0.0023 }))
      .toEqual({ choline: 400, manganese: 2.3, molybdenum: 45, biotin: 30, chromium: 35, pantothenicAcid: 5, riboflavin: 1.3, thiamin: 1.2 });
  });
  it('drops a value over each nutrient cap and scales the rest to the grams eaten', () => {
    expect(cleanMicro({ choline: 35001, manganese: 111, molybdenum: 20001, biotin: 601, chromium: 701, pantothenicAcid: 101, riboflavin: 27, thiamin: 25 })).toBeNull();
    expect(cleanMicro({ choline: 35000, manganese: 110, molybdenum: 20000, biotin: 600, chromium: 700, pantothenicAcid: 100, riboflavin: 26, thiamin: 24 })).toMatchObject({ choline: 35000, thiamin: 24 });
    expect(scaleMicro({ thiamin: 0.4, chromium: 3, choline: 100 }, 1.5)).toEqual({ choline: 150, chromium: 4.5, thiamin: 0.6 });
  });
  it('a food that lists none of the eight is unchanged', () => {
    expect(usdaMicro(a({ '301': 120 }))).toEqual({ calcium: 120 });
  });
});
