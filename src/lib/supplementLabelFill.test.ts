import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapDsldLabel, type SupplementLabel } from '../shared/dsldLabel.js';
import { otherLine, otherShown, planFill, servingWords } from './supplementLabelFill.js';

const fixture = (n: string) => mapDsldLabel(JSON.parse(readFileSync(new URL(`../shared/fixtures/${n}`, import.meta.url), 'utf8')))!;
const gummies = fixture('dsld-276834-gummies-d3.json');
const ddrops = fixture('dsld-320047-ddrops-d3.json');
const mega = fixture('dsld-219004-mega-men-mcg.json');
const everyMan = fixture('dsld-40175-every-man-ii.json');

describe('planFill: adding a catalog supplement (nothing there yet)', () => {
  it('every tracked label row is new, and the countable serving is saved with its form', () => {
    const p = planFill({}, gummies);
    expect(p.lines.map(l => [l.key, l.change])).toEqual([['vitaminD', 'new'], ['sodium', 'new']]);
    expect(p.result).toEqual({ nutrients: gummies.rows, serving: { units: 2, form: 'Gummy' } });
    expect(p.changes).toBe(true);
  });
  it('a liquid serving saves no serving size', () => {
    const p = planFill({}, ddrops);
    expect(p.result).toEqual({ nutrients: [{ key: 'vitaminD', amount: 50, unit: 'mcg' }] });
    expect(p.serving).toBeUndefined();
    expect(servingWords(ddrops)).toContain('1 drop');
  });
});

describe('planFill: the eight added nutrients (brief supplement-more-nutrients)', () => {
  it('a label import fills them as new rows, in table order, with the label units', () => {
    const p = planFill({}, everyMan);
    const keys = p.lines.map(l => l.key);
    for (const k of ['manganese', 'molybdenum', 'biotin', 'chromium', 'pantothenicAcid', 'riboflavin', 'thiamin']) expect(keys, k).toContain(k);
    expect(p.lines.find(l => l.key === 'chromium')).toMatchObject({ change: 'new', fromLabel: { amount: 100, unit: 'mcg' }, label: 'Chromium' });
    expect(p.lines.find(l => l.key === 'thiamin')?.label).toBe('Thiamin (vitamin B1)');
    expect(keys.indexOf('manganese')).toBeLessThan(keys.indexOf('zinc')); // limit keys first, then the targets
    expect(keys.indexOf('zinc')).toBeLessThan(keys.indexOf('biotin'));
    expect(p.changes).toBe(true);
  });
  it('Fill from label replaces a typed thiamin amount and keeps a nutrient the label omits', () => {
    const p = planFill({ nutrients: [{ key: 'thiamin', amount: 1, unit: 'mg' }, { key: 'choline', amount: 50, unit: 'mg' }] }, everyMan);
    expect(p.lines.find(l => l.key === 'thiamin')?.change).toBe('replace');
    expect(p.lines.find(l => l.key === 'choline')?.change).toBe('kept');
  });
});

describe('planFill: Fill from label on a supplement in the library (Done when 3)', () => {
  const typed = { nutrients: [{ key: 'vitaminD' as const, amount: 25, unit: 'mcg' as const }, { key: 'vitaminK' as const, amount: 90, unit: 'mcg' as const }, { key: 'zinc' as const, amount: 11, unit: 'mg' as const }], serving: { units: 1, form: 'Capsule' } };
  const label: SupplementLabel = { name: 'x', serving: { text: '2 gummies', units: 2, form: 'Gummy' }, rows: [{ key: 'vitaminD', amount: 50, unit: 'mcg' }, { key: 'zinc', amount: 11, unit: 'mg' }], other: [] };
  it('shows what is replaced, what is the same and what is kept', () => {
    const p = planFill(typed, label);
    expect(Object.fromEntries(p.lines.map(l => [l.key, l.change]))).toEqual({ vitaminD: 'replace', zinc: 'same', vitaminK: 'kept' });
    expect(p.lines.find(l => l.key === 'vitaminD')).toMatchObject({ current: [{ amount: 25, unit: 'mcg' }], fromLabel: { amount: 50, unit: 'mcg' } });
  });
  it('replaces the rows the label lists and keeps the person\'s own others', () => {
    const p = planFill(typed, label);
    expect(p.result.nutrients).toEqual([{ key: 'vitaminD', amount: 50, unit: 'mcg' }, { key: 'zinc', amount: 11, unit: 'mg' }, { key: 'vitaminK', amount: 90, unit: 'mcg' }]);
    expect(p.result.serving).toEqual({ units: 2, form: 'Gummy' });
    expect(p.serving).toEqual({ now: { units: 1, form: 'Capsule' }, label: { units: 2, form: 'Gummy' } });
  });
  it('is pure: the inputs are not changed, so Cancel (not saving the result) changes nothing', () => {
    const before = JSON.stringify(typed);
    planFill(typed, label);
    expect(JSON.stringify(typed)).toBe(before);
  });
  it('a label row replaces a typed row in another unit of the same nutrient', () => {
    const p = planFill({ nutrients: [{ key: 'vitaminD', amount: 2000, unit: 'IU' }, { key: 'vitaminD', amount: 5, unit: 'mcg' }] }, label);
    expect(p.result.nutrients.filter(r => r.key === 'vitaminD')).toEqual([{ key: 'vitaminD', amount: 50, unit: 'mcg' }]);
    expect(p.lines[0].change).toBe('replace');
  });
  it('keeps the serving size when the label has a liquid serving', () => {
    expect(planFill({ nutrients: [], serving: { units: 1, form: 'Capsule' } }, ddrops).result.serving).toEqual({ units: 1, form: 'Capsule' });
  });
  it('says there is nothing to change when the supplement already matches, or the label has no tracked amounts', () => {
    expect(planFill({ nutrients: [{ key: 'vitaminD', amount: 50, unit: 'mcg' }, { key: 'sodium', amount: 10, unit: 'mg' }], serving: { units: 2, form: 'Gummy' } }, gummies).changes).toBe(false);
    expect(planFill({}, { name: 'x', serving: null, rows: [], other: [{ name: 'Thiamine', amount: 5, unit: 'mg' }] }).changes).toBe(false);
  });
  it('never makes more rows than a supplement may hold', () => {
    const p = planFill({}, mega);
    expect(p.result.nutrients.length).toBeLessThanOrEqual(30);
  });
});

describe('the "Also on the label" lines', () => {
  it('say "amount not stated" for a line with no amount', () => {
    expect(otherLine({ name: 'Super Blend' })).toEqual({ name: 'Super Blend', amount: 'amount not stated' });
    expect(otherLine({ name: 'Calories', amount: 15, unit: 'Calorie(s)' })).toEqual({ name: 'Calories', amount: '15 Calorie(s)' });
  });
  it('show at most 40 and count the rest', () => {
    const many: SupplementLabel = { name: 'x', serving: null, rows: [], other: Array.from({ length: 55 }, (_, i) => ({ name: `n${i}` })) };
    const s = otherShown(many);
    expect(s.lines).toHaveLength(40); expect(s.more).toBe(15);
    expect(servingWords(many)).toBe('not stated');
  });
});
