import { describe, expect, it } from 'vitest';
import { MAX_DIET_PER_DAY } from '../shared/diet.js';
import type { DietEntry } from '../types.ts';
import type { AddEntry, NewEntry } from './instantLog.js';
import { addState, addToToday, eatenDayText, lastEaten, planDay, stillAdded, summaryCells, wholePackFor } from './recipeSummary.js';

const today = '2026-11-15'; // a Sunday
const stew = { id: 'stew', n: 'Stew', cat: 'protein' as const, servings: 4, kcal: 400, p: 30 };
const e = (id: string, d: string, from?: string): DietEntry => ({ id, d, n: 'x', kcal: 1, p: 1, ...(from ? { from } : {}) });
const adder = (log: NewEntry[] = [], error: string | null = null): AddEntry => en => {
  if (error) return { id: null, error };
  log.push(en);
  return { id: `n${log.length}`, error: null };
};

describe('lastEaten', () => {
  it('is the newest entry from this recipe only', () => {
    const diet = [e('a', '2026-11-10', 'stew'), e('b', '2026-11-13', 'stew'), e('c', '2026-11-14', 'other'), e('d', '2026-11-12', 'stew'), e('f', '2026-11-14')];
    expect(lastEaten(diet, 'stew')?.id).toBe('b');
  });
  it('is null when it was never eaten', () => {
    expect(lastEaten([e('c', '2026-11-14', 'other')], 'stew')).toBeNull();
    expect(lastEaten([], 'stew')).toBeNull();
  });
  it('takes the later entry when two share the newest day', () => {
    expect(lastEaten([e('a', '2026-11-14', 'stew'), e('b', '2026-11-14', 'stew')], 'stew')?.id).toBe('b');
  });
});

describe('eatenDayText', () => {
  it('words today and yesterday', () => {
    expect(eatenDayText(today, today)).toBe('today');
    expect(eatenDayText('2026-11-14', today)).toBe('yesterday');
  });
  it('gives a weekday inside the last week', () => {
    expect(eatenDayText('2026-11-13', today)).toBe('Fri');
    expect(eatenDayText('2026-11-09', today)).toBe('Mon');
  });
  it('gives a date once it is more than a week back', () => {
    expect(eatenDayText('2026-11-08', today)).toBe('8 Nov');
    expect(eatenDayText('2026-11-03', today)).toBe('3 Nov');
  });
  it('gives a date for a day after today', () => {
    expect(eatenDayText('2026-11-17', today)).toBe('17 Nov');
  });
});

describe('summaryCells', () => {
  const base = { recipe: stew, rolled: null, mine: true, have: 3, total: 5, inventoryItems: 12, diet: [] as DietEntry[], today };
  const keys = (o: Parameters<typeof summaryCells>[0]) => summaryCells(o).map(c => c.key);
  it('shows per serving, at home and never eaten for a recipe of yours', () => {
    expect(summaryCells({ ...base, recipe: { ...stew, c: 20, f: 9 } })).toEqual([
      { key: 'per', head: '400 kcal', sub: 'P 30 · C 20 · F 9 g per serving', words: '400 calories, 30 grams protein, 20 grams carbs, 9 grams fat per serving' },
      { key: 'home', head: '3 of 5 at home', sub: '2 missing' },
      { key: 'last', head: 'Not eaten yet', sub: '' },
    ]);
  });
  it('keeps the unit on the second line of the macro box', () => {
    expect(summaryCells(base)[0]).toMatchObject({ head: '400 kcal', sub: 'P 30 g per serving' });
    expect(summaryCells({ ...base, recipe: { ...stew, p: undefined } })[0]).toMatchObject({ head: '400 kcal', sub: 'per serving' });
  });
  it('words the last eaten day over the usual portion', () => {
    const cells = summaryCells({ ...base, recipe: { ...stew, usual: 1.5 }, diet: [e('a', '2026-11-13', 'stew')] });
    expect(cells.at(-1)).toEqual({ key: 'last', head: 'Last eaten Fri', sub: 'Usual 1.5 portions' });
    expect(summaryCells({ ...base, diet: [e('a', '2026-11-03', 'stew')] }).at(-1)).toEqual({ key: 'last', head: 'Last eaten 3 Nov', sub: 'Usual 1 portion' });
  });
  it('says "Not eaten yet", with the usual only when one is saved', () => {
    expect(summaryCells({ ...base, recipe: { ...stew, usual: 2 } }).at(-1)).toEqual({ key: 'last', head: 'Not eaten yet', sub: 'Usual 2 portions' });
    expect(summaryCells({ ...base, recipe: { ...stew, cat: 'ready', unit: 'egg', usual: 3 } }).at(-1)?.sub).toBe('Usual 3 eggs');
  });
  it('has no last eaten for a recipe that is not in Mine', () => {
    expect(keys({ ...base, mine: false, diet: [e('a', '2026-11-13', 'stew')] })).toEqual(['per', 'home']);
  });
  it('leaves at-home out with no ingredients or no inventory items, and no sub line when nothing is missing', () => {
    expect(keys({ ...base, total: 0 })).toEqual(['per', 'last']);
    expect(keys({ ...base, inventoryItems: 0 })).toEqual(['per', 'last']);
    expect(summaryCells({ ...base, have: 5 })[1]).toEqual({ key: 'home', head: '5 of 5 at home', sub: '' });
  });
  it('uses the rolled-up numbers of a meal built from parts', () => {
    expect(summaryCells({ ...base, rolled: { kcal: 520, p: 41 } })[0]).toMatchObject({ head: '520 kcal', sub: 'P 41 g per serving' });
  });
  it('says "No numbers yet" for a recipe of yours without any, and nothing for a library recipe', () => {
    expect(summaryCells({ ...base, recipe: { ...stew, kcal: undefined, p: undefined } })[0]).toEqual({ key: 'nonum', head: 'No numbers yet', sub: 'Calories and protein per serving are missing' });
    expect(keys({ ...base, mine: false, recipe: { ...stew, kcal: undefined, p: undefined } })).toEqual(['home']);
  });
});

describe('addState', () => {
  it('is Add to today for a recipe of yours with numbers, then Added until undone', () => {
    expect(addState({ mine: true, recipe: stew, added: false })).toBe('add');
    expect(addState({ mine: true, recipe: stew, added: true })).toBe('added');
  });
  it('asks for numbers when calories or protein are missing', () => {
    expect(addState({ mine: true, recipe: {}, added: false })).toBe('needs-numbers');
    expect(addState({ mine: true, recipe: { kcal: 200 }, added: false })).toBe('needs-numbers');
  });
  it('is Add to Mine for a library recipe, whatever else is true', () => {
    expect(addState({ mine: false, recipe: stew, added: true })).toBe('to-mine');
    expect(addState({ mine: false, recipe: {}, added: false })).toBe('to-mine');
  });
});

describe('planDay', () => {
  it('is tomorrow, across a month end', () => {
    expect(planDay(today)).toBe('2026-11-16');
    expect(planDay('2026-11-30')).toBe('2026-12-01');
  });
});

describe('addToToday', () => {
  it('logs one portion of the usual amount for today and words it', () => {
    const log: NewEntry[] = [];
    const r = addToToday(adder(log), { ...stew, usual: 2 }, today);
    expect(r).toEqual({ ok: true, id: 'n1', text: 'Logged Stew, 2 portions, for today.' });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ d: today, n: 'Stew', kcal: 800, p: 60, from: 'stew', x: 2 });
  });
  it('logs one portion when no usual is saved', () => {
    const log: NewEntry[] = [];
    expect(addToToday(adder(log), stew, today)).toMatchObject({ ok: true, text: 'Logged Stew, 1 portion, for today.' });
    expect(log[0]).toMatchObject({ kcal: 400, p: 30 });
  });
  it('shows the store’s sentence and logs nothing when the day is full', () => {
    const full = `You can log ${MAX_DIET_PER_DAY} things a day.`;
    const log: NewEntry[] = [];
    expect(addToToday(adder(log, full), stew, today)).toEqual({ ok: false, error: full });
    expect(log).toHaveLength(0);
  });
  it('refuses a recipe with no calories and protein without calling the store', () => {
    const log: NewEntry[] = [];
    expect(addToToday(adder(log), { ...stew, kcal: undefined, p: undefined }, today).ok).toBe(false);
    expect(log).toHaveLength(0);
  });
});

describe('wholePackFor', () => {
  const gnocchi = { cat: 'ready' as const, servings: 12, kcal: 210, p: 6 };
  it('is the pack size for a ready-made food of yours with numbers', () => {
    expect(wholePackFor({ mine: true, recipe: gnocchi })).toBe(12);
  });
  it('is null with no pack size, a pack of 1, not yours, no numbers, or not ready-made', () => {
    expect(wholePackFor({ mine: true, recipe: { ...gnocchi, servings: undefined } })).toBeNull();
    expect(wholePackFor({ mine: true, recipe: { ...gnocchi, servings: 1 } })).toBeNull();
    expect(wholePackFor({ mine: false, recipe: gnocchi })).toBeNull();
    expect(wholePackFor({ mine: true, recipe: { ...gnocchi, kcal: undefined } })).toBeNull();
    expect(wholePackFor({ mine: true, recipe: { ...gnocchi, cat: 'protein' } })).toBeNull();
  });
  it('is null when the pack is more than one entry can hold', () => {
    expect(wholePackFor({ mine: true, recipe: { cat: 'ready', servings: 40, kcal: 900, p: 20 } })).toBeNull();
  });
});

describe('addToToday with an amount', () => {
  it('logs the amount it is given (a whole pack) and words it', () => {
    const log: NewEntry[] = [];
    const r = addToToday(adder(log), { id: 'g', n: 'Gnocchi', cat: 'ready', servings: 12, kcal: 210, p: 6, usual: 2 }, today, 12);
    expect(r).toEqual({ ok: true, id: 'n1', text: 'Logged Gnocchi, 12 portions, for today.' });
    expect(log[0]).toMatchObject({ kcal: 2520, p: 72, x: 12 });
  });
});

describe('stillAdded', () => {
  it('keeps the id while the entry is in the log and drops it once it is gone', () => {
    expect(stillAdded([e('a', today)], 'a')).toBe('a');
    expect(stillAdded([e('b', today)], 'a')).toBeNull();
    expect(stillAdded([], null)).toBeNull();
  });
});
