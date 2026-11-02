import { describe, expect, it } from 'vitest';
import { daysChoices, loadEffect, NAME_MAX, parseStart, START_VALUES, suggestName } from './programStart';

const label = (k: 'A' | 'B') => `Program ${k}`;

describe('parseStart', () => {
  it('reads every value the sheet offers and nothing else', () => {
    for (const v of START_VALUES) expect(parseStart(v), v).not.toBeNull();
    expect(parseStart('starter:nope')).toBeNull();
    expect(parseStart('copy:C')).toBeNull();
    expect(parseStart('')).toBeNull();
  });
  it('offers the four starters, then both copies, then a blank program', () => {
    expect(START_VALUES).toEqual(['starter:ppl', 'starter:upperlower', 'starter:fullbody', 'starter:fivebyfive', 'copy:A', 'copy:B', 'blank']);
  });
});

describe('daysChoices', () => {
  it('lists a starter’s days a week, default first, and nothing for a copy or a blank program', () => {
    expect(daysChoices('starter:ppl')).toEqual([3, 6]);
    expect(daysChoices('starter:fivebyfive')).toEqual([3]);
    expect(daysChoices('copy:A')).toEqual([]);
    expect(daysChoices('blank')).toEqual([]);
  });
});

describe('suggestName', () => {
  it('names a starter with its days, a copy after its source, and a blank program plainly', () => {
    expect(suggestName('starter:ppl', 3, label)).toBe('Push / Pull / Legs · 3 days');
    expect(suggestName('copy:B', 3, label)).toBe('Copy of Program B');
    expect(suggestName('blank', 3, label)).toBe('My program');
    expect(suggestName('zzz', 3, label)).toBe('');
  });
});

describe('suggestName length', () => {
  it('never goes past the name limit, even for a copy of a long program name', () => {
    const long = 'x'.repeat(60);
    expect(suggestName('copy:A', 3, () => long)).toHaveLength(NAME_MAX);
  });
});

describe('loadEffect', () => {
  it('says what loadVersion does with the program in the slot', () => {
    expect(loadEffect(true, false)).toBe('unchanged');
    expect(loadEffect(true, true)).toBe('unchanged');
    expect(loadEffect(false, false)).toBe('saved first');
    expect(loadEffect(false, true)).toBe('already saved');
  });
});
