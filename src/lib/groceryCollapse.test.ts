import { describe, expect, it } from 'vitest';
import { isCollapsed, toggleFolded, unfoldGrown } from './groceryCollapse.js';

describe('groceryCollapse', () => {
  it('toggles a store in and out', () => {
    const a = toggleFolded(new Set(), 'Aldi');
    expect([...a]).toEqual(['Aldi']);
    expect(toggleFolded(a, 'Aldi').size).toBe(0);
  });
  it('a search shows folded stores', () => {
    expect(isCollapsed(new Set(['Aldi']), 'Aldi', '')).toBe(true);
    expect(isCollapsed(new Set(['Aldi']), 'Aldi', ' milk ')).toBe(false);
    expect(isCollapsed(new Set(), 'Aldi', '')).toBe(false);
  });
  it('unfolds a store that gained an item and keeps the rest', () => {
    const next = unfoldGrown(new Set(['Aldi', 'Costco']), new Map([['Aldi', 2], ['Costco', 1]]), new Map([['Aldi', 3], ['Costco', 1]]));
    expect([...next]).toEqual(['Costco']);
  });
});
