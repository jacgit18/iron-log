import { describe, expect, it } from 'vitest';
import { offHit, offName } from './offFood.js';

// Answers captured from the live Open Food Facts product API on 2026-11-05 (fields trimmed to the ones read).
const ALDI = { status: 1, product: { code: '4099100063851', product_name: 'Woven Whole Wheat Crackers', brands: 'Aldi', serving_quantity: 28, nutriments: { 'energy-kcal_100g': 428.571428571429, proteins_100g: 7.14285714285714, carbohydrates_100g: 71.4285714285714, fat_100g: 14.2857142857143 } } };
const TRADER = { status: 1, product: { code: '00665636', product_name: 'Mandarin Orange Chicken', brands: "Trader Joe's", serving_quantity: 163, nutriments: { 'energy-kcal_100g': 196.319018404908, proteins_100g: 13.4969325153374, carbohydrates_100g: 21.4723926380368, fat_100g: 6.13496932515337 } } };

describe('offHit', () => {
  it('reads an Aldi product per 100 g with its serving in grams and the off source', () => {
    expect(offHit(ALDI, '04099100063851')).toEqual({ id: 4099100063851, name: 'Woven Whole Wheat Crackers', brand: 'Aldi', kcal: 429, p: 7.1, c: 71.4, f: 14.3, serving: 28, source: 'off' });
  });

  it('reads a Trader Joe’s product (8-digit code padded to 14)', () => {
    expect(offHit(TRADER, '00000000665636')).toEqual({ id: 665636, name: 'Mandarin Orange Chicken', brand: "Trader Joe's", kcal: 196, p: 13.5, c: 21.5, f: 6.1, serving: 163, source: 'off' });
  });

  it('takes the first brand, reads numbers written as text, and leaves out what is missing', () => {
    const hit = offHit({ status: 1, product: { product_name: ' Granola  bar ', brands: 'Acme, Other', serving_quantity: '40', nutriments: { 'energy-kcal_100g': '450', proteins_100g: '8' } } }, '00000000000017');
    expect(hit).toEqual({ id: 17, name: 'Granola bar', brand: 'Acme', kcal: 450, p: 8, serving: 40, source: 'off' });
  });

  it('skips a product with no name, no calories or no protein, and a serving that is not sensible', () => {
    const n = { 'energy-kcal_100g': 100, proteins_100g: 5 };
    expect(offHit({ status: 1, product: { nutriments: n } }, '00000000000017')).toBeNull();
    expect(offHit({ status: 1, product: { product_name: 'x', nutriments: { proteins_100g: 5 } } }, '00000000000017')).toBeNull();
    expect(offHit({ status: 1, product: { product_name: 'x', nutriments: { 'energy-kcal_100g': 100 } } }, '00000000000017')).toBeNull();
    expect(offHit({ status: 1, product: { product_name: 'x', nutriments: { 'energy-kcal_100g': 0, proteins_100g: 0 } } }, '00000000000017')).toBeNull();
    expect(offHit({ status: 1, product: { product_name: 'x', serving_quantity: 99999, nutriments: n } }, '00000000000017')).not.toHaveProperty('serving');
    expect(offHit({ status: 1, product: { product_name: 'x', serving_quantity: -3, nutriments: n } }, '00000000000017')).not.toHaveProperty('serving');
  });

  it('answers null for a product that is not found and never throws on odd input', () => {
    for (const odd of [null, undefined, 3, 'x', [], {}, { status: 0 }, { status: 0, product: ALDI.product }, { status: 1 }, { status: 1, product: 'x' }, { status: 1, product: { product_name: 'x', nutriments: 'x' } }]) expect(offHit(odd, '00000000000017')).toBeNull();
  });
});

describe('offName (supplement scan: name and brand only)', () => {
  it('reads the name and the first brand, without needing nutrition', () => {
    expect(offName({ status: 1, product: { product_name: ' Amino  Energy ', brands: 'Optimum Nutrition, ON' } })).toEqual({ name: 'Amino Energy', brand: 'Optimum Nutrition' });
    expect(offName({ status: 1, product: { product_name: 'Plain' } })).toEqual({ name: 'Plain' });
  });
  it('is null for an unknown product, a product with no name or junk', () => {
    expect(offName({ status: 0 })).toBeNull();
    expect(offName({ status: 1, product: { brands: 'X' } })).toBeNull();
    expect(offName(null)).toBeNull();
  });
});
