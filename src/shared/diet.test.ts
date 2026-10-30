import { describe, expect, it } from 'vitest';
import { MAX_DIET_PER_DAY, MAX_PLAN_ITEMS, MAX_MEALS, MAX_MEAL_ITEMS, cleanGrams, cleanHour, dietPosition, cleanKcal, cleanProtein, normDietCfg, targetError, normDietEntries, normDietEntry, validDietEntry } from './diet.js';
import { normRecipe } from './recipes.js';
import { normConfig } from './config.js';
import { validateSaveListItem } from './commands.js';

const ok = { id: 'e1', d: '2026-10-29', n: 'Rice', kcal: 200, p: 4 };

describe('normDietEntry', () => {
  it('keeps a clean entry and rounds the numbers', () => {
    expect(normDietEntry(ok)).toEqual(ok);
    expect(normDietEntry({ ...ok, kcal: 200.4, p: 4.26, from: 'r1' })).toEqual({ ...ok, kcal: 200, p: 4.3, from: 'r1' });
  });
  it.each([
    ['no name', { ...ok, n: '  ' }], ['no id', { ...ok, id: '' }], ['bad date', { ...ok, d: '2026-13-40' }],
    ['zero calories', { ...ok, kcal: 0 }], ['too many calories', { ...ok, kcal: 10000 }], ['negative protein', { ...ok, p: -1 }], ['text calories', { ...ok, kcal: '200' }],
    ['not an object', 'rice'],
  ])('refuses %s', (_w, v) => { expect(normDietEntry(v)).toBeNull(); });
  it('allows zero protein', () => { expect(normDietEntry({ ...ok, p: 0 })).toMatchObject({ p: 0 }); });
  it('keeps optional carbs and fat, one decimal, and leaves an unusable one out (the entry is still good)', () => {
    expect(normDietEntry({ ...ok, c: 44.26, f: 0 })).toEqual({ ...ok, c: 44.3, f: 0 });
    expect(normDietEntry({ ...ok, c: -1, f: 'x' })).toEqual(ok);
    expect(normDietEntry({ ...ok, c: 1000 })).toEqual(ok);
  });
});

describe('validDietEntry', () => {
  it('accepts only what the app would write', () => {
    expect(validDietEntry(ok)).toBe(true);
    expect(validDietEntry({ ...ok, kcal: 200.4 })).toBe(false);
    expect(validDietEntry({ ...ok, extra: 1 })).toBe(false);
    expect(validDietEntry({ ...ok, c: 40, f: 10 })).toBe(true);
    expect(validDietEntry({ ...ok, c: 40.26 })).toBe(false);
  });
});

describe('normDietEntries', () => {
  it('drops repeats and unusable ones but keeps every synced entry of a day (the daily limit is enforced when adding)', () => {
    const many = Array.from({ length: MAX_DIET_PER_DAY + 3 }, (_, i) => ({ ...ok, id: `x${i}` }));
    expect(normDietEntries(many)).toHaveLength(MAX_DIET_PER_DAY + 3);
    expect(normDietEntries([ok, ok, { nope: 1 }, null])).toEqual([ok]);
    expect(normDietEntries('x')).toEqual([]);
  });
});

describe('numbers', () => {
  it('cleanKcal / cleanProtein', () => {
    expect(cleanKcal(600.6)).toBe(601); expect(cleanKcal(0)).toBeNull(); expect(cleanKcal(NaN)).toBeNull();
    expect(cleanProtein(0)).toBe(0); expect(cleanProtein(1000)).toBeNull(); expect(cleanProtein(Infinity)).toBeNull();
  });
});

describe('dietPosition', () => {
  it('is the day counted from 2020-01-01, the same for every entry of a day, and within the list limit', () => {
    expect(dietPosition('2020-01-01')).toBe(0);
    expect(dietPosition('2020-01-02')).toBe(1);
    expect(dietPosition('2026-10-29')).toBe(2493);
    expect(dietPosition('2019-01-01')).toBe(0);
    expect(dietPosition('2099-01-01')).toBe(9999);
  });
});

describe('targetError', () => {
  it('says why a target is refused and accepts a clear', () => {
    expect(targetError('kcal', 3000)).toBeNull(); expect(targetError('kcal', null)).toBeNull();
    expect(targetError('kcal', 100)).toBe('Calories must be 500 to 9,999.');
    expect(targetError('protein', 5)).toBe('Protein must be 10 to 999.');
    expect(targetError('protein', NaN)).toMatch(/Protein/);
    expect(targetError('carbs', 5)).toBe('Carbs must be 10 to 999.');
    expect(targetError('fat', 80)).toBeNull();
  });
});

describe('normDietCfg and the config document', () => {
  it('keeps targets in range only', () => {
    expect(normDietCfg({ kcal: 3000, protein: 180 })).toEqual({ kcal: 3000, protein: 180 });
    expect(normDietCfg({ kcal: 100, protein: 180 })).toEqual({ protein: 180 });
    expect(normDietCfg({ kcal: 100, protein: 1 })).toBeUndefined();
    expect(normDietCfg({ kcal: 3000, carbs: 400, fat: 80 })).toEqual({ kcal: 3000, carbs: 400, fat: 80 });
    expect(normDietCfg({ carbs: 5, fat: 1000 })).toBeUndefined();
    expect(normDietCfg([])).toBeUndefined();
  });
  it('keeps a pace pick: a preset, or Custom with a rate in range', () => {
    expect(normDietCfg({ pace: 'slow' })).toEqual({ pace: 'slow' });
    expect(normDietCfg({ kcal: 3000, pace: 'fast', rate: 2 })).toEqual({ kcal: 3000, pace: 'fast' }); // a rate belongs to Custom only
    expect(normDietCfg({ pace: 'custom', rate: 0.756 })).toEqual({ pace: 'custom', rate: 0.76 });
    expect(normDietCfg({ pace: 'custom' })).toBeUndefined();
    expect(normDietCfg({ pace: 'custom', rate: 0 })).toBeUndefined();
    expect(normDietCfg({ pace: 'custom', rate: 9 })).toBeUndefined();
    expect(normDietCfg({ pace: 'reckless' })).toBeUndefined();
    expect(normConfig({ diet: { pace: 'steady' } }).diet).toEqual({ pace: 'steady' });
  });
  it('normConfig keeps a good diet key and drops a bad one', () => {
    expect(normConfig({ diet: { kcal: 3000 } }).diet).toEqual({ kcal: 3000 });
    expect('diet' in normConfig({ diet: { kcal: 5 } })).toBe(false);
  });
});

describe('recipe macros and the list command', () => {
  it('cleanGrams is the protein range', () => { expect(cleanGrams(12.34)).toBe(12.3); expect(cleanGrams(1000)).toBeNull(); });
  it('a recipe keeps carbs and fat per serving too', () => {
    const base = { id: 'r1', n: 'Chili', ing: [{ n: 'beans' }], steps: [] };
    expect(normRecipe({ ...base, kcal: 600, p: 40, c: 51, f: 11 })).toMatchObject({ c: 51, f: 11 });
    expect(normRecipe({ ...base, c: -2 })).not.toHaveProperty('c');
  });
  it('a recipe keeps calories and protein per serving, and drops bad ones', () => {
    const base = { id: 'r1', n: 'Chili', ing: [{ n: 'beans' }], steps: [] };
    expect(normRecipe({ ...base, kcal: 600, p: 40 })).toMatchObject({ kcal: 600, p: 40 });
    const r = normRecipe({ ...base, kcal: -5, p: 'x' });
    expect(r && 'kcal' in r).toBe(false);
    expect(r && 'p' in r).toBe(false);
  });
  it('save-list-item accepts a diet entry and refuses an unclean one', () => {
    expect(validateSaveListItem({ list: 'diet_entry', item: ok, position: 0 })).toEqual({ list: 'diet_entry', item: ok, position: 0 });
    expect(validateSaveListItem({ list: 'diet_entry', item: { ...ok, kcal: 200.4 }, position: 0 })).toBeNull();
  });
});

describe('the hour an entry was added (t)', () => {
  const base = { id: 'e1', d: '2026-10-30', n: 'Oats', kcal: 350, p: 12 };
  it('keeps a whole hour from 0 to 23 and leaves out anything else', () => {
    expect(normDietEntry({ ...base, t: 0 })).toEqual({ ...base, t: 0 });
    expect(normDietEntry({ ...base, t: 23 })).toEqual({ ...base, t: 23 });
    for (const t of [24, -1, 8.5, '8', null, NaN]) expect(normDietEntry({ ...base, t })).toEqual(base);
  });
  it('an entry without one is unchanged, so older data loads as it was', () => {
    expect(normDietEntry(base)).toEqual(base);
    expect(validDietEntry(base)).toBe(true);
  });
  it('the API refuses an hour out of range', () => {
    expect(validDietEntry({ ...base, t: 8 })).toBe(true);
    expect(validDietEntry({ ...base, t: 24 })).toBe(false);
  });
  it('cleanHour', () => { expect(cleanHour(7)).toBe(7); expect(cleanHour(7.5)).toBeNull(); expect(cleanHour(undefined)).toBeNull(); });
});

describe('saved meals in cfg.diet', () => {
  const it1 = { n: 'Oats', kcal: 350, p: 12 };
  const m = (id: string, n: string, items: unknown[] = [it1]) => ({ id, n, items });
  it('keeps good meals beside the targets', () => {
    expect(normDietCfg({ kcal: 3000, meals: [m('a', 'Breakfast')] })).toEqual({ kcal: 3000, meals: [m('a', 'Breakfast')] });
    expect(normDietCfg({ meals: [m('a', 'Breakfast')] })).toEqual({ meals: [m('a', 'Breakfast')] });
  });
  it('drops a meal with no usable food, no name, no id or a repeated id or name', () => {
    const r = normDietCfg({ meals: [m('a', 'One'), m('b', 'Empty', []), m('c', 'Bad', [{ n: 'X', kcal: 0, p: 1 }]), m('', 'NoId'), m('a', 'RepeatId'), m('d', ' one '), m('e', '  ')] });
    expect(r!.meals!.map(x => x.id)).toEqual(['a']);
  });
  it('cleans each food and keeps carbs, fat and the recipe link', () => {
    const r = normDietCfg({ meals: [m('a', 'M', [{ n: ' Chili ', kcal: 600.4, p: 40, c: 51, f: 11, from: 'r1', junk: 1 }, { n: '', kcal: 5, p: 1 }])] });
    expect(r!.meals![0]!.items).toEqual([{ n: 'Chili', kcal: 600, p: 40, c: 51, f: 11, from: 'r1' }]);
  });
  it('trims to the caps', () => {
    const many = Array.from({ length: MAX_MEALS + 5 }, (_, i) => m(`m${i}`, `Meal ${i}`));
    expect(normDietCfg({ meals: many })!.meals).toHaveLength(MAX_MEALS);
    const foods = Array.from({ length: MAX_MEAL_ITEMS + 4 }, (_, i) => ({ n: `F${i}`, kcal: 10, p: 1 }));
    expect(normDietCfg({ meals: [m('a', 'Big', foods)] })!.meals![0]!.items).toHaveLength(MAX_MEAL_ITEMS);
  });
  it('is undefined when nothing usable is left, and survives normConfig', () => {
    expect(normDietCfg({ meals: [m('a', 'Empty', [])] })).toBeUndefined();
    expect(normConfig({ diet: { meals: [m('a', 'Breakfast')] } }).diet).toEqual({ meals: [m('a', 'Breakfast')] });
  });
});

describe('the plan in cfg.diet', () => {
  const today = '2026-10-30';
  it('keeps good days and items beside the targets', () => {
    const plan = { '2026-10-30': [{ k: 'r', id: 'r1', x: 1.5 }, { k: 'm', id: 'm1' }] };
    expect(normDietCfg({ kcal: 3000, plan })).toEqual({ kcal: 3000, plan });
    expect(normDietCfg({ plan })).toEqual({ plan });
  });
  it('cleans an item: kind, id, and a portion only in half steps from 0.5 to 10 other than 1', () => {
    const r = normDietCfg({ plan: { '2026-10-30': [{ k: 'r', id: 'a', x: 1 }, { k: 'r', id: 'b', x: 0.25 }, { k: 'r', id: 'c', x: 11 }, { k: 'r', id: 'd', x: 2.5 }, { k: 'm', id: 'e', x: 2 }, { k: 'x', id: 'f' }, { k: 'r', id: '' }, 5, null] } });
    expect(r!.plan!['2026-10-30']).toEqual([{ k: 'r', id: 'a' }, { k: 'r', id: 'b' }, { k: 'r', id: 'c' }, { k: 'r', id: 'd', x: 2.5 }, { k: 'm', id: 'e' }]);
  });
  it('drops bad dates, empty days, repeats and items past the cap', () => {
    const many = Array.from({ length: MAX_PLAN_ITEMS + 3 }, (_, i) => ({ k: 'r', id: `r${i}` }));
    const r = normDietCfg({ plan: { 'nope': [{ k: 'r', id: 'a' }], '2026-13-45': [{ k: 'r', id: 'a' }], '2026-10-30': many, '2026-10-31': [], '2026-11-01': [{ k: 'r', id: 'a' }, { k: 'r', id: 'a' }] } });
    expect(Object.keys(r!.plan!)).toEqual(['2026-10-30', '2026-11-01']);
    expect(r!.plan!['2026-10-30']).toHaveLength(MAX_PLAN_ITEMS);
    expect(r!.plan!['2026-11-01']).toEqual([{ k: 'r', id: 'a' }]);
  });
  it('applies the window only when given today', () => {
    const plan = { '2026-10-29': [{ k: 'r', id: 'a' }], '2026-10-30': [{ k: 'r', id: 'a' }], '2026-11-12': [{ k: 'r', id: 'a' }], '2026-11-13': [{ k: 'r', id: 'a' }] };
    expect(Object.keys(normDietCfg({ plan })!.plan!)).toHaveLength(4);
    expect(Object.keys(normDietCfg({ plan }, today)!.plan!)).toEqual(['2026-10-30', '2026-11-12']);
  });
  it('is undefined when nothing usable is left, and survives normConfig', () => {
    expect(normDietCfg({ plan: { '2026-10-30': [{ k: 'q' }] } })).toBeUndefined();
    expect(normConfig({ diet: { plan: { '2026-10-30': [{ k: 'm', id: 'm1' }] } } }).diet).toEqual({ plan: { '2026-10-30': [{ k: 'm', id: 'm1' }] } });
  });
});
