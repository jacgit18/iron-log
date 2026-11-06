import { describe, expect, it } from 'vitest';
import { cleanStoreName } from './receiptStoreName.js';

describe('cleanStoreName', () => {
  it('drops store numbers, filler words and addresses, and fixes the capitals', () => {
    expect(cleanStoreName('COSTCO WHOLESALE #123')).toBe('Costco');
    expect(cleanStoreName("TRADER JOE'S #45")).toBe("Trader Joe's");
    expect(cleanStoreName('Wal-Mart Supercenter')).toBe('Wal-Mart');
    expect(cleanStoreName('Aldi Inc, 1200 Main St')).toBe('Aldi');
    expect(cleanStoreName('Corner Shop 1200 Main St')).toBe('Corner Shop');
    expect(cleanStoreName('Farmers market - Saturday')).toBe('Farmers Market');
  });
  it('gives null when nothing usable is left', () => {
    expect(cleanStoreName(undefined)).toBeNull();
    expect(cleanStoreName('')).toBeNull();
    expect(cleanStoreName('#123')).toBeNull();
    expect(cleanStoreName('Inc')).toBeNull();
    expect(cleanStoreName('AB')).toBeNull();
  });
  it('keeps at most 40 characters', () => {
    expect(cleanStoreName('x'.repeat(80))!.length).toBe(40);
  });
});
