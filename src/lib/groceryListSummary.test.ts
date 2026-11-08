import { describe, expect, it } from 'vitest';
import { boughtSummaryText, editSummaryText, getSummaryText } from './groceryListSummary.js';

describe('grocery list summary', () => {
  it('Shopping: count and total, no total when nothing is priced', () => {
    expect(getSummaryText(9, 6240)).toBe('9 to get · $62.40');
    expect(getSummaryText(3, 0)).toBe('3 to get');
  });
  it('Bought: count and total', () => {
    expect(boughtSummaryText(5, 3810)).toBe('5 bought · $38.10');
    expect(boughtSummaryText(0, 0)).toBe('0 bought');
  });
  it('Inventory edit: items and how many you have', () => {
    expect(editSummaryText(14, 6)).toBe('14 items · 6 you have');
    expect(editSummaryText(1, 0)).toBe('1 item · 0 you have');
    expect(editSummaryText(0, 0)).toBe('0 items');
  });
});
