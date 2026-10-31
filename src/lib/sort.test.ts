import { describe, expect, it } from 'vitest';
import { byName, nameCmp, sortByName } from './sort.js';

const row = (id: string, n: string) => ({ id, n });
const sorted = (rows: { id: string; n: string }[]) => sortByName(rows, r => r.n, r => r.id).map(r => r.id);

describe('sortByName', () => {
  it('ignores case', () => expect(sorted([row('1', 'banana'), row('2', 'Apple'), row('3', 'cherry')])).toEqual(['2', '1', '3']));
  it('ignores accents', () => expect(sorted([row('1', 'Zebra'), row('2', 'Éclair'), row('3', 'Eel'), row('4', 'Apple')])).toEqual(['4', '2', '3', '1']));
  it('puts Item 2 before Item 10', () => expect(sorted([row('a', 'Item 10'), row('b', 'Item 2'), row('c', 'Item 1')])).toEqual(['c', 'b', 'a']));
  it('orders equal names by id, whatever the input order', () => {
    expect(sorted([row('b', 'Squat'), row('a', 'squat'), row('c', 'SQUAT')])).toEqual(['a', 'b', 'c']);
    expect(sorted([row('c', 'SQUAT'), row('a', 'squat'), row('b', 'Squat')])).toEqual(['a', 'b', 'c']);
  });
  it('does not change the input array', () => {
    const input = [row('2', 'b'), row('1', 'a')];
    const copy = [...input];
    const out = sortByName(input, r => r.n, r => r.id);
    expect(input).toEqual(copy);
    expect(out).not.toBe(input);
  });
});

describe('byName and nameCmp', () => {
  it('byName treats case and accent variants as equal', () => { expect(byName('Café', 'cafe')).toBe(0); expect(byName('a', 'B')).toBeLessThan(0); });
  it('nameCmp breaks a tie by id, not by name case', () => expect(nameCmp<[string, string]>(x => x[0], x => x[1])(['a', '2'], ['A', '1'])).toBeGreaterThan(0));
});
