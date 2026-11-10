import { describe, expect, it } from 'vitest';
import { cleanGtin, gtinFromScan, hitForGtin, nameForGtin, upcEToUpcA } from './barcode.js';

describe('cleanGtin', () => {
  it('pads valid 8, 12, 13 and 14 digit codes to 14 digits', () => {
    expect(cleanGtin('016000275287')).toBe('00016000275287'); // Cheerios, UPC-A
    expect(cleanGtin('4006381333931')).toBe('04006381333931'); // EAN-13
    expect(cleanGtin('96385074')).toBe('00000096385074'); // EAN-8
    expect(cleanGtin('00016000275287')).toBe('00016000275287'); // already 14
  });
  it('refuses a wrong check digit, wrong lengths, letters and non-strings', () => {
    expect(cleanGtin('016000275288')).toBeNull();
    expect(cleanGtin('0160002752')).toBeNull();
    expect(cleanGtin('01600027528a')).toBeNull();
    expect(cleanGtin(' 016000275287')).toBeNull();
    expect(cleanGtin('')).toBeNull();
    expect(cleanGtin(16000275287)).toBeNull();
    expect(cleanGtin(null)).toBeNull();
  });
});

describe('upcEToUpcA', () => {
  it('writes out each UPC-E ending (the check digit is carried over unchanged)', () => {
    expect(upcEToUpcA('01234500')).toBe('012000003450'); // sixth digit 0
    expect(upcEToUpcA('01234510')).toBe('012100003450'); // 1
    expect(upcEToUpcA('01234520')).toBe('012200003450'); // 2
    expect(upcEToUpcA('01234530')).toBe('012300000450'); // 3
    expect(upcEToUpcA('01234540')).toBe('012340000050'); // 4
    expect(upcEToUpcA('01234565')).toBe('012345000065'); // 5 to 9
  });
  it('gives a UPC-A with a valid check digit for a real UPC-E', () => {
    expect(cleanGtin(upcEToUpcA('01234565')!)).toBe('00012345000065');
  });
  it('refuses what is not UPC-E shaped', () => {
    expect(upcEToUpcA('21234565')).toBeNull();
    expect(upcEToUpcA('0123456')).toBeNull();
    expect(upcEToUpcA('abcdefgh')).toBeNull();
  });
});

describe('gtinFromScan', () => {
  it('uses the reader format to expand UPC-E and reads the rest as they are', () => {
    expect(gtinFromScan('01234565', 'upc_e')).toBe('00012345000065');
    expect(gtinFromScan('016000275287', 'upc_a')).toBe('00016000275287');
    expect(gtinFromScan('4006381333931')).toBe('04006381333931');
  });
  it('refuses a misread code', () => {
    expect(gtinFromScan('016000275288', 'upc_a')).toBeNull();
    expect(gtinFromScan('https://example.com', 'qr_code')).toBeNull();
    expect(gtinFromScan(undefined)).toBeNull();
  });
});

describe('hitForGtin', () => {
  const nutrients = [{ nutrientNumber: '208', value: 380 }, { nutrientNumber: '203', value: 10 }];
  const food = (fdcId: number, gtinUpc: unknown, description = 'Cheerios Cereal') => ({ fdcId, description, gtinUpc, brandOwner: 'General Mills', servingSize: 28, servingSizeUnit: 'GRM', foodNutrients: nutrients });
  it('returns the product whose code equals the scan, padded to 14 digits', () => {
    const answer = { foods: [food(1, '00016000322622'), food(2, '00016000275287'), food(3, '16000275287')] };
    expect(hitForGtin(answer, '00016000275287')).toMatchObject({ id: 2, name: 'Cheerios Cereal', brand: 'General Mills', kcal: 380, p: 10, serving: 28 });
  });
  it('matches a code USDA stored without the zero padding', () => {
    expect(hitForGtin({ foods: [food(3, '16000275287')] }, '00016000275287')?.id).toBe(3);
  });
  it('returns null when no product has that exact code, even if its text mentions the digits', () => {
    expect(hitForGtin({ foods: [food(1, '00016000322622'), food(4, undefined, '00016000275287 Cheerios')] }, '00016000275287')).toBeNull();
  });
  it('returns null for a matching product without calories or protein, and for junk answers', () => {
    expect(hitForGtin({ foods: [{ fdcId: 5, description: 'Empty', gtinUpc: '00016000275287', foodNutrients: [] }] }, '00016000275287')).toBeNull();
    expect(hitForGtin(null, '00016000275287')).toBeNull();
    expect(hitForGtin({ foods: 'x' }, '00016000275287')).toBeNull();
    expect(hitForGtin({ foods: [food(6, 16000275287)] }, '00016000275287')).toBeNull(); // a number, not a string
  });
});

describe('nameForGtin (supplement scan: name and brand, no nutrition needed)', () => {
  const foods = [
    { description: 'OTHER', gtinUpc: '00074306800099', brandOwner: 'X' },
    { description: ' Green  Vibrance ', gtinUpc: '74306800046', brandName: 'Vibrant Health', brandOwner: 'Owner Co' },
  ];
  it('takes the product whose own code is exactly the scan, with no calories or protein, brand name first', () => {
    expect(nameForGtin({ foods }, '00074306800046')).toEqual({ name: 'Green Vibrance', brand: 'Vibrant Health' });
  });
  it('is null for a near match, a product with no name, or an unreadable answer', () => {
    expect(nameForGtin({ foods: [foods[0]] }, '00074306800046')).toBeNull();
    expect(nameForGtin({ foods: [{ description: '  ', gtinUpc: '00074306800046' }] }, '00074306800046')).toBeNull();
    expect(nameForGtin(null, '00074306800046')).toBeNull();
    expect(nameForGtin({ foods: 'x' }, '00074306800046')).toBeNull();
  });
});
