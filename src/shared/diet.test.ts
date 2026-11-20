import { describe, expect, it } from 'vitest';
import { PLAN_SLOTS, MAX_DIET_PER_DAY, MAX_DAY_ITEMS, MAX_DAY_STORED, MAX_PLAN_AHEAD, MAX_HANDY, MAX_REPEATS, isDrinkItem, normHintSkips, normHintsOff, normRepeatSkips, normRepeats, plannedCount, MAX_MEALS, MAX_MEAL_ITEMS, cleanGrams, cleanHour, dietPosition, cleanKcal, cleanProtein, normDietCfg, targetError, normDietEntries, normDietEntry, validDietEntry } from './diet.js';
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
  it('keeps the portion count x within 0.5 to 99 (two decimals) and drops anything else; an entry without it stays without it', () => {
    expect(normDietEntry({ ...ok, x: 1.5 })).toEqual({ ...ok, x: 1.5 });
    expect(normDietEntry({ ...ok, x: 0.5 })).toMatchObject({ x: 0.5 });
    expect(normDietEntry({ ...ok, x: 99 })).toMatchObject({ x: 99 });
    for (const bad of [0.49, 0, -1, 100, NaN, '2', null]) expect(normDietEntry({ ...ok, x: bad })).toEqual(ok);
    expect('x' in normDietEntry(ok)!).toBe(false);
  });
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
    const many = Array.from({ length: MAX_DAY_STORED + 3 }, (_, i) => ({ k: 'r', id: `r${i}` }));
    const r = normDietCfg({ plan: { 'nope': [{ k: 'r', id: 'a' }], '2026-13-45': [{ k: 'r', id: 'a' }], '2026-10-30': many, '2026-10-31': [], '2026-11-01': [{ k: 'r', id: 'a' }, { k: 'r', id: 'a' }] } });
    expect(Object.keys(r!.plan!)).toEqual(['2026-10-30', '2026-11-01']);
    expect(r!.plan!['2026-10-30']).toHaveLength(MAX_DAY_STORED); // the cleaner holds only the storage bound (the available list plus room for ticked snacks and drinks)
    expect(r!.plan!['2026-11-01']).toEqual([{ k: 'r', id: 'a' }]);
  });
  it('applies the window only when given today', () => {
    const plan = { '2026-10-29': [{ k: 'r', id: 'a' }], '2026-10-30': [{ k: 'r', id: 'a' }], '2027-10-29': [{ k: 'r', id: 'a' }], '2027-10-30': [{ k: 'r', id: 'a' }] };
    expect(Object.keys(normDietCfg({ plan })!.plan!)).toHaveLength(4);
    expect(Object.keys(normDietCfg({ plan }, today)!.plan!)).toEqual(['2026-10-30', '2027-10-29']);
  });
  it('is undefined when nothing usable is left, and survives normConfig', () => {
    expect(normDietCfg({ plan: { '2026-10-30': [{ k: 'q' }] } })).toBeUndefined();
    expect(normConfig({ diet: { plan: { '2026-10-30': [{ k: 'm', id: 'm1' }] } } }).diet).toEqual({ plan: { '2026-10-30': [{ k: 'm', id: 'm1' }] } });
  });
});

describe('est on an entry (brief recipe-auto-nutrition)', () => {
  const withMicro = { ...ok, micro: { manganese: 1.2 } };
  it('keeps the mark with vitamins and minerals, and round-trips', () => {
    expect(normDietEntry({ ...withMicro, est: true })).toEqual({ ...withMicro, est: true });
    expect(validDietEntry({ ...withMicro, est: true })).toBe(true);
  });
  it('drops it without vitamins, or when it is not exactly true', () => {
    expect(normDietEntry({ ...ok, est: true })).toEqual(ok);
    expect(normDietEntry({ ...withMicro, est: 'yes' })).toEqual(withMicro);
  });
});

describe('repeats and repeatSkips in cfg.diet (brief nutrition-meal-labels-year-repeat)', () => {
  const rep = { rid: 'a', k: 'r', id: 'oats', days: [1, 3], from: '2026-10-30' };
  it('keeps a clean repeat and round-trips it through normDietCfg', () => {
    expect(normRepeats([rep])).toEqual([rep]);
    const cfg = { repeats: [{ ...rep, x: 2, s: 'breakfast' }], repeatSkips: { '2026-11-02': ['a'] } };
    expect(normDietCfg(cfg, '2026-10-30')).toEqual(cfg);
    expect(normDietCfg(normDietCfg(cfg, '2026-10-30'), '2026-10-30')).toEqual(cfg);
    expect(normDietCfg({ repeats: [], repeatSkips: {} })).toBeUndefined();
  });
  it('drops unknown keys, an unknown meal, a portion of 1 or one out of range, and a saved meal\'s portion', () => {
    expect(normRepeats([{ ...rep, junk: 1, s: 'brunch', x: 1 }])).toEqual([rep]);
    expect(normRepeats([{ ...rep, x: 11 }, { ...rep, rid: 'b', x: 2.5 }, { ...rep, rid: 'c', k: 'm', x: 2 }])).toEqual([rep, { ...rep, rid: 'b', x: 2.5 }, { ...rep, rid: 'c', k: 'm' }]);
  });
  it('refuses a repeat with no usable weekday, id, name, kind or start day, and a repeated name', () => {
    const bad = [{ ...rep, days: [] }, { ...rep, days: [7, -1, 'x'] }, { ...rep, days: 'all' }, { ...rep, id: '' }, { ...rep, rid: '' }, { ...rep, k: 'x' }, { ...rep, from: 'nope' }, { ...rep, from: '2026-13-40' }, 5, null, 'a'];
    expect(normRepeats(bad)).toEqual([]);
    expect(normRepeats([rep, { ...rep, id: 'other' }])).toEqual([rep]);
  });
  it('sorts the weekdays, keeps each once and drops other values', () => {
    expect(normRepeats([{ ...rep, days: [5, 1, 1, 9, 0, 'x', 2.5] }])[0]!.days).toEqual([0, 1, 5]);
  });
  it('keeps at most MAX_REPEATS (12)', () => {
    expect(MAX_REPEATS).toBe(12);
    const many = Array.from({ length: 20 }, (_, i) => ({ ...rep, rid: `r${i}` }));
    expect(normRepeats(many)).toHaveLength(12);
  });
  it('keeps h only when exactly true, and counts handy items apart from repeats (24 and 12)', () => {
    expect(normRepeats([{ ...rep, h: true }])).toEqual([{ ...rep, h: true }]);
    expect(normRepeats([{ ...rep, h: 'yes' }, { ...rep, rid: 'b', h: false }, { ...rep, rid: 'c', h: 1 }])).toEqual([rep, { ...rep, rid: 'b' }, { ...rep, rid: 'c' }]);
    expect(MAX_HANDY).toBe(24);
    const mixed = [...Array.from({ length: 30 }, (_, i) => ({ ...rep, rid: `h${i}`, h: true })), ...Array.from({ length: 15 }, (_, i) => ({ ...rep, rid: `r${i}` }))];
    const out = normRepeats(mixed);
    expect(out.filter(r => r.h)).toHaveLength(24);
    expect(out.filter(r => !r.h)).toHaveLength(12);
    const cfg = { repeats: [{ ...rep, h: true, s: 'lunch' }] };
    expect(normDietCfg(normDietCfg(cfg, '2026-10-30'), '2026-10-30')).toEqual(cfg);
  });
  it('cleans skips: real dates, text ids once each, no empty day; with today the window applies', () => {
    const raw = { '2026-11-02': ['a', 'a', 'b', '', 5], nope: ['a'], '2026-11-03': [], '2026-10-01': ['a'], '2028-01-01': ['a'] };
    expect(normRepeatSkips(raw)).toEqual({ '2026-10-01': ['a'], '2026-11-02': ['a', 'b'], '2028-01-01': ['a'] });
    expect(normRepeatSkips(raw, '2026-10-30')).toEqual({ '2026-11-02': ['a', 'b'] });
    expect(normRepeatSkips('x')).toEqual({});
    expect(normRepeatSkips([['a']])).toEqual({});
  });
  it('keeps keys the build does not know beside them (ADR 122)', () => {
    expect(normDietCfg({ repeats: [rep], later: { a: 1 } })).toEqual({ repeats: [rep], later: { a: 1 } });
  });
});

describe('the 52-week window', () => {
  it('is 364 days, and the plan cleaner keeps a day that far ahead and drops the next', () => {
    expect(MAX_PLAN_AHEAD).toBe(364);
    const last = '2027-10-29', past = '2027-10-30'; // today is 2026-10-30
    const plan = { [last]: [{ k: 'r', id: 'a' }], [past]: [{ k: 'r', id: 'a' }] };
    expect(Object.keys(normDietCfg({ plan }, '2026-10-30')!.plan!)).toEqual([last]);
  });
});

describe('drinks outside the planned count', () => {
  const items = [{ k: 'r' as const, id: 'tea' }, { k: 'r' as const, id: 'rice' }, { k: 'm' as const, id: 'tea' }];
  const drinks: ReadonlySet<string> = new Set(['tea']);
  it('a drink item is a recipe whose id is in the set', () => {
    expect(isDrinkItem(items[0]!, drinks)).toBe(true);
    expect(isDrinkItem(items[2]!, drinks)).toBe(false); // a saved meal is never a drink
    expect(isDrinkItem(items[0]!, undefined)).toBe(false);
  });
  it('leaves drinks out of plannedCount when given, and counts only items marked planned', () => {
    const marked = items.map(i => ({ ...i, p: true as const }));
    expect(plannedCount(marked, undefined, drinks)).toBe(2);
    expect(plannedCount(marked, undefined)).toBe(3);
    expect(plannedCount(items, undefined)).toBe(0); // stored before the marker: available, not planned
  });
  it('keeps the planned marker through the cleaner, only when exactly true', () => {
    const r = normDietCfg({ plan: { '2026-10-30': [{ k: 'r', id: 'a', p: true }, { k: 'r', id: 'b', p: 'yes' }, { k: 'r', id: 'c', p: false }] } });
    expect(r!.plan!['2026-10-30']).toEqual([{ k: 'r', id: 'a', p: true }, { k: 'r', id: 'b' }, { k: 'r', id: 'c' }]);
  });
  it('keeps up to the storage bound a day and drops the next', () => {
    const day = Array.from({ length: MAX_DAY_STORED + 1 }, (_, i) => ({ k: 'r', id: `r${i}`, ...(i < 9 ? { p: true } : {}) }));
    expect(normDietCfg({ plan: { '2026-10-30': day } })!.plan!['2026-10-30']).toHaveLength(MAX_DAY_STORED);
  });
});

describe('PLAN_SLOTS', () => {
  it('is the meal order everywhere (board sections and the Add food, Move to and log pickers): Dinner above Snack', () => {
    expect(PLAN_SLOTS).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
  });
});

describe('hintsOff and hintSkips in cfg.diet (brief nutrition-plate-hints-per-meal)', () => {
  it('keeps known meals once each in meal order and drops the rest', () => {
    expect(normHintsOff(['dinner', 'breakfast', 'dinner', 'brunch', 3])).toEqual(['breakfast', 'dinner']);
    expect(normHintsOff('breakfast')).toEqual([]);
  });
  it('keeps real days in the window and drops past days, bad days and empty lists', () => {
    const v = { '2026-11-02': ['lunch', 'breakfast'], '2026-10-01': ['lunch'], nope: ['lunch'], '2026-11-03': [] };
    expect(normHintSkips(v, '2026-10-30')).toEqual({ '2026-11-02': ['breakfast', 'lunch'] });
    expect(normHintSkips([], '2026-10-30')).toEqual({});
  });
  it('round-trips through normDietCfg and is undefined when empty', () => {
    const cfg = { hintsOff: ['breakfast'], hintSkips: { '2026-11-02': ['lunch'] } };
    expect(normDietCfg(cfg, '2026-10-30')).toEqual(cfg);
    expect(normDietCfg({ hintsOff: [], hintSkips: {} })).toBeUndefined();
    expect(normDietCfg({ hintsOff: ['brunch'] })).toBeUndefined();
  });
});
