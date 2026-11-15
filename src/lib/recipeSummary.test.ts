import { describe, expect, it } from 'vitest';
import { MAX_DIET_PER_DAY } from '../shared/diet.js';
import type { DietEntry } from '../types.ts';
import type { AddEntry, NewEntry } from './instantLog.js';
import { addState, addToToday, atHomeText, eatenDayText, lastEaten, lastEatenText, planDay, stripMacros } from './recipeSummary.js';

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

describe('lastEatenText', () => {
  it('says when it was last eaten, with the usual portion', () => {
    expect(lastEatenText({ ...stew, usual: 1.5 }, [e('a', '2026-11-13', 'stew')], today, true)).toBe('Last eaten Fri, usual 1.5 portions');
    expect(lastEatenText(stew, [e('a', '2026-11-03', 'stew')], today, true)).toBe('Last eaten 3 Nov, usual 1 portion');
  });
  it('says "Not eaten yet", and the usual only when one is saved', () => {
    expect(lastEatenText(stew, [], today, true)).toBe('Not eaten yet');
    expect(lastEatenText({ ...stew, usual: 2 }, [], today, true)).toBe('Not eaten yet, usual 2 portions');
  });
  it('is left out for a recipe that is not in Mine', () => {
    expect(lastEatenText(stew, [e('a', '2026-11-13', 'stew')], today, false)).toBeNull();
  });
  it('uses the food’s own unit', () => {
    expect(lastEatenText({ ...stew, cat: 'ready', unit: 'egg', usual: 3 }, [], today, true)).toBe('Not eaten yet, usual 3 eggs');
  });
});

describe('atHomeText', () => {
  it('reads "N of M at home"', () => expect(atHomeText(3, 5, 12)).toBe('3 of 5 at home'));
  it('is left out with no ingredients or no inventory items', () => {
    expect(atHomeText(0, 0, 12)).toBeNull();
    expect(atHomeText(0, 5, 0)).toBeNull();
  });
});

describe('stripMacros', () => {
  it('uses the rolled-up numbers of a meal built from parts', () => {
    expect(stripMacros({ kcal: 400, p: 30 }, { kcal: 520, p: 41 })).toBe('520 kcal · P 41 g');
  });
  it('uses the recipe’s own otherwise, and is empty without numbers', () => {
    expect(stripMacros({ kcal: 400, p: 30, c: 20, f: 9 }, null)).toBe('400 kcal · P 30 · C 20 · F 9 g');
    expect(stripMacros({}, null)).toBe('');
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
