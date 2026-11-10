import { describe, expect, it } from 'vitest';
import { exactListingText, fromBarcodeText, readListing, scanSearchSteps, SUPP_BARCODE_TEXT, suppBarcodeText, typedUpc } from './supplementBarcodeQuery.js';

describe('typedUpc', () => {
  it('accepts a valid product code written plain, with spaces (NIH style) or with dashes', () => {
    expect(typedUpc('074306800046')).toBe('074306800046');
    expect(typedUpc(' 0 74306 80004 6 ')).toBe('074306800046');
    expect(typedUpc('0-74306-80004-6')).toBe('074306800046');
    expect(typedUpc('4006381333931')).toBe('4006381333931');
  });
  it('refuses a wrong check digit, a wrong length, letters and ordinary names', () => {
    for (const bad of ['074306800047', '12345', '0743068000461234567', 'abc', 'vitamin d3', 'b12', '', '5000 iu']) expect(typedUpc(bad), bad).toBeNull();
  });
});

describe('scanSearchSteps', () => {
  it('tries brand and name first, then the name alone', () => {
    expect(scanSearchSteps({ name: 'GREEN VIBRANCE', brand: 'Vibrant Health' })).toEqual(['Vibrant Health GREEN VIBRANCE', 'GREEN VIBRANCE']);
  });
  it('has one step when there is no brand or the name already starts with it', () => {
    expect(scanSearchSteps({ name: 'Amino Energy' })).toEqual(['Amino Energy']);
    expect(scanSearchSteps({ name: 'Nature Made Vitamin D3', brand: 'NATURE MADE' })).toEqual(['Nature Made Vitamin D3']);
  });
  it('stays inside what the catalog search accepts (6 words, 100 letters)', () => {
    const steps = scanSearchSteps({ name: 'Ultra Strength Omega 3 Fish Oil Softgels 1000 mg Lemon', brand: 'Some Long Brand' });
    for (const s of steps) { expect(s.split(/\s+/).length).toBeLessThanOrEqual(6); expect(s.length).toBeLessThanOrEqual(100); }
    expect(scanSearchSteps({ name: 'x'.repeat(300) })).toEqual([]); // one absurd word cannot be searched
  });
  it('gives nothing for a name too short to search', () => {
    expect(scanSearchSteps({ name: 'a' })).toEqual([]);
  });
});

describe('messages', () => {
  it('has a plain line for every way a scan or a typed code can end, each pointing to typing the name', () => {
    for (const f of Object.keys(SUPP_BARCODE_TEXT) as (keyof typeof SUPP_BARCODE_TEXT)[]) expect(suppBarcodeText(f).length, f).toBeGreaterThan(10);
    expect(suppBarcodeText('notfound')).toMatch(/type the name/i);
    expect(suppBarcodeText('camera')).toMatch(/photo/i);
  });
  it('names the product in the note under a filled search', () => {
    expect(fromBarcodeText({ name: 'Green Vibrance' })).toContain('Green Vibrance');
  });
});

describe('readListing', () => {
  it('reads the listing the route answers and trims it', () => {
    expect(readListing({ id: 'c:dsld:42', name: '  Omega-3 ', brand: ' Thorne ', data: { form: 'Softgel', entryYear: 2024 } })).toEqual({ id: 'c:dsld:42', name: 'Omega-3', brand: 'Thorne', data: { form: 'Softgel', entryYear: 2024 } });
    expect(readListing({ id: 'c:dsld:7', name: 'Plain' })).toEqual({ id: 'c:dsld:7', name: 'Plain', data: {} });
  });
  it('refuses anything that is not a DSLD catalog listing, so an odd answer never becomes a pick', () => {
    for (const bad of [null, 'x', [], {}, { id: 'c:dsld:1' }, { id: 'c:dsld:1', name: '  ' }, { id: 'c:fedb:Squat', name: 'Squat' }, { id: 'c:dsld:abc', name: 'x' }, { id: 5, name: 'x' }]) expect(readListing(bad), JSON.stringify(bad)).toBeUndefined();
    expect(readListing({ id: 'c:dsld:1', name: 'x', data: [1] })).toEqual({ id: 'c:dsld:1', name: 'x', data: {} });
  });
  it('says what the person should do next', () => { expect(exactListingText).toMatch(/label amounts/); });
});
