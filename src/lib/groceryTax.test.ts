import { describe, expect, it } from 'vitest';
import { parseTaxPercent, taxCents, taxText, withTax } from './groceryTax.js';

describe('tax in cents', () => {
  it('is worked out once on the subtotal and rounded to the cent', () => {
    expect(taxCents(5372, 8875)).toBe(477); // 5372 x 8.875% = 476.77
    expect(taxCents(10000, 8875)).toBe(888); // 887.5 rounds up
    expect(taxCents(5372)).toBe(0);
    expect(taxCents(0, 8875)).toBe(0);
    expect(taxCents(-100, 8875)).toBe(0);
  });
  it('adds each store\'s own tax to its subtotal', () => {
    expect(withTax({ "BJ's": 5372, Aldi: 500 }, { "BJ's": 8875 })).toBe(5372 + 477 + 500);
    expect(withTax({ "BJ's": 5372 })).toBe(5372);
  });
});

describe('typing a rate', () => {
  it('reads a percent with up to 3 decimals into thousandths of a percent', () => {
    expect(parseTaxPercent('8.875')).toBe(8875);
    expect(parseTaxPercent(' 8,875 % ')).toBe(8875);
    expect(parseTaxPercent('7')).toBe(7000);
    expect(parseTaxPercent('30')).toBe(30000);
    expect(parseTaxPercent('0.001')).toBe(1);
  });
  it('refuses what is not a rate', () => {
    for (const bad of ['', 'abc', '0', '31', '8.8755', '-1', '1e1', '8.']) expect(parseTaxPercent(bad), bad).toBeNull();
  });
  it('writes a rate back the way it was typed', () => {
    expect(taxText(8875)).toBe('8.875');
    expect(taxText(7000)).toBe('7');
    expect(taxText(undefined)).toBe('');
  });
});
