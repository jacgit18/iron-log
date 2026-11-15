import { describe, expect, it } from 'vitest';
import { bracketGrams, hasAmount, cleanAnswer, cleanLineMatch, cleanLines, cleanPicks, cleanPlan, cleanTerm, confidenceOf, leadingGrams, normalizeLine, textGrams, MAX_LINE, MAX_LINES } from './ingredientMatch.js';

const hit = { id: 7, name: 'Flour, wheat', kcal: 360, p: 10, c: 76, f: 1, micro: { iron: 4.6 } };
const ok = { status: 'matched', fdcId: 7, food: 'Flour, wheat', grams: 100, gramsFrom: 'text', confidence: 'high', per100: hit };

describe('cleanLines', () => {
  it('squeezes, cuts and keeps order', () => {
    expect(cleanLines(['  2   eggs ', 'x'.repeat(200)])).toEqual(['2 eggs', 'x'.repeat(MAX_LINE)]);
  });
  it('refuses a bad shape, an empty line and too many', () => {
    expect(cleanLines('eggs')).toBeNull();
    expect(cleanLines([])).toBeNull();
    expect(cleanLines(['eggs', ' '])).toBeNull();
    expect(cleanLines(['eggs', 3])).toBeNull();
    expect(cleanLines(Array(MAX_LINES + 1).fill('egg'))).toBeNull();
    expect(cleanLines(Array(MAX_LINES).fill('egg'))).toHaveLength(MAX_LINES);
  });
});

describe('normalizeLine', () => {
  it('ignores case, spacing and a trailing stop', () => expect(normalizeLine(' 2  Eggs, ')).toBe(normalizeLine('2 eggs')));
});

describe('grams from the text', () => {
  it.each([
    ['½ cup (100 g) all-purpose flour', 100],
    ['1 cup [120 g, sifted] flour', 120],
    ['2 cups (1 lb) sugar', 453.6],
    ['1 cup (about 100 g) flour', null],
    ['1 cup (100-120 g) flour', null],
    ['2 cups flour', null],
    ['2 (14 oz) cans tomatoes', 793.8],
    ['3 cans (14 oz) beans', 1190.7],
    ['1 (8 oz) package cream cheese', 226.8],
    ['2 cups (240 g) milk', 240],
    ['2-3 (14 oz) cans tomatoes', null],
    ['100 (100 oz) cans', null],
  ])('bracket: %s', (line, g) => expect(bracketGrams(line)).toBe(g));
  it.each([
    ['200 g flour', 200], ['½ lb butter', 226.8], ['1 1/2 kg potatoes', 1500], ['8 oz cream cheese', 226.8], ['1.5 lb beef', 680.4],
    ['2-3 oz ham', null], ['2 cups flour', null], ['100 grams', 100], ['6000 g water', null], ['0 g salt', null], ['1 lb 4 oz beef', 567], ['1 kg 200 g flour', 1200], ['1 lb 2 cups', 453.6], ['1 lb 4 g beef', null],
  ])('leading: %s', (line, g) => expect(leadingGrams(line)).toBe(g));
  it('leading weight wins over brackets', () => expect(textGrams('200 g flour (1 lb)')).toBe(200));
});

describe('hasAmount', () => {
  it.each([['2 eggs', true], ['½ cup milk', true], ['a pinch of salt', false], ['an onion', false], ['One medium onion', true], ['Olive oil', false], ['Salt', false]])('%s', (line, yes) => expect(hasAmount(line)).toBe(yes));
});

describe('confidenceOf', () => {
  it('is high only for text or converted grams on an exact pick', () => {
    expect(confidenceOf('text', false)).toBe('high');
    expect(confidenceOf('converted', false)).toBe('high');
    expect(confidenceOf('converted', true)).toBe('low');
    expect(confidenceOf('guess', false)).toBe('low');
  });
});

describe('model answers are checked', () => {
  it('cleanTerm blanks brackets and keeps the search rule', () => {
    expect(cleanTerm('baking apples (granny smith)')).toBe('baking apples granny smith');
    expect(cleanTerm('a')).toBeNull();
    expect(cleanTerm(5)).toBeNull();
  });
  it('cleanPlan needs one entry per line and drops grams out of range', () => {
    expect(cleanPlan({ lines: [] }, 1)).toBeNull();
    expect(cleanPlan({ lines: [{ term: 'eggs', grams: 6000, gramsFrom: 'text' }, { skip: true }, 'junk'] }, 3)).toEqual([
      { skip: false, term: 'eggs', grams: null, gramsFrom: 'text' },
      { skip: true, term: null, grams: null, gramsFrom: 'guess' },
      { skip: false, term: null, grams: null, gramsFrom: 'guess' },
    ]);
  });
  it('cleanPicks keeps only ids that were shown for that line', () => {
    const shown = new Map([[0, new Set([7, 8])], [1, new Set([9])]]);
    const picks = cleanPicks({ picks: [{ i: 0, id: 8, approximate: false }, { i: 1, id: 7 }, { i: 5, id: 9 }, { i: 0, id: 7 }] }, shown);
    expect(picks.get(0)).toEqual({ id: 8, approximate: false });
    expect(picks.get(1)).toEqual({ id: null, approximate: true });
    expect(picks.has(5)).toBe(false);
  });
});

describe('cleanLineMatch', () => {
  it('keeps a good match', () => expect(cleanLineMatch(ok, '100 g flour')).toEqual({ line: '100 g flour', ...ok }));
  it.each([
    ['grams out of range', { ...ok, grams: 9000 }],
    ['grams zero', { ...ok, grams: 0 }],
    ['food id not the per-100 row', { ...ok, fdcId: 8 }],
    ['no per-100 row', { ...ok, per100: undefined }],
    ['unknown grams source', { ...ok, gramsFrom: 'magic' }],
    ['no confidence', { ...ok, confidence: undefined }],
    ['junk', 'x'],
  ])('a matched line with %s becomes none', (_n, raw) => expect(cleanLineMatch(raw, 'l')).toEqual({ line: 'l', status: 'none' }));
  it('keeps skip', () => expect(cleanLineMatch({ status: 'skip', fdcId: 3 }, 'water')).toEqual({ line: 'water', status: 'skip' }));
  it('cleanAnswer is one per line sent or nothing', () => {
    expect(cleanAnswer({ lines: [ok] }, ['a', 'b'])).toBeNull();
    expect(cleanAnswer({ lines: [ok, { status: 'none' }] }, ['a', 'b'])?.map(m => m.status)).toEqual(['matched', 'none']);
  });
});
