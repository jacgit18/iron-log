import { describe, expect, it } from 'vitest';
import { normalizeData } from './export.js';
import { normGrocery } from './grocery.js';
import { MAX_ALIAS, MAX_ALIASES, cleanAliases, normGroceryItem, validGroceryItem } from '../shared/grocery.js';

// Brief receipt-rename-memory: `aliases` on a grocery item (receipt texts the person renamed to it) is accepted, trimmed, capped and kept by backup, import and the API check.
const base = { id: 'milk', n: 'Milk', store: 'Aldi', qty: 1, cents: 300, every: true, out: false };

describe('item aliases', () => {
  it('keeps clean names and drops the field when there are none', () => {
    expect(normGroceryItem({ ...base, aliases: ['ORG WHL MLK'] })?.aliases).toEqual(['ORG WHL MLK']);
    expect(normGroceryItem({ ...base, aliases: [] })).not.toHaveProperty('aliases');
    expect(normGroceryItem({ ...base, aliases: 'ORG' })).not.toHaveProperty('aliases');
  });
  it('collapses spaces, cuts to 60 characters, dedupes by lowercase text and caps at 20', () => {
    expect(cleanAliases(['  A   B ', 'a b', 5, '', 'x'.repeat(100)])).toEqual(['A B', 'x'.repeat(MAX_ALIAS)]);
    const many = Array.from({ length: 30 }, (_, i) => `name ${i}`);
    expect(cleanAliases(many)).toHaveLength(MAX_ALIASES);
  });
  it('the API check accepts exactly what the app writes and refuses the rest', () => {
    expect(validGroceryItem({ ...base, aliases: ['ORG WHL MLK'] })).toBe(true);
    expect(validGroceryItem({ ...base })).toBe(true);
    expect(validGroceryItem({ ...base, aliases: ['a', 'A'] })).toBe(false);
    expect(validGroceryItem({ ...base, aliases: [' pad '] })).toBe(false);
    expect(validGroceryItem({ ...base, aliases: ['x'.repeat(61)] })).toBe(false);
    expect(validGroceryItem({ ...base, aliases: [] })).toBe(false);
  });
  it('survive a backup round trip', () => {
    const g = { stores: ['Aldi'], items: [{ ...base, aliases: ['ORG WHL MLK', 'MLK 1GAL'] }], months: {} };
    const out = normalizeData(JSON.parse(JSON.stringify({ app: 'iron-log', format: 1, config: {}, grocery: g })));
    expect(out.grocery?.items[0]?.aliases).toEqual(['ORG WHL MLK', 'MLK 1GAL']);
    expect(normGrocery(g).items[0]?.aliases).toEqual(['ORG WHL MLK', 'MLK 1GAL']);
  });
});
