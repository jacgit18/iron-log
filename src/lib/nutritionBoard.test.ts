import { describe, expect, it } from 'vitest';
import type { DietEntry, Recipe, Supplements } from '../types.ts';
import { addFlows, addingTo, basisOf, dayGroups, dayView, foodEditable, hydrationView, mealByTime, onBoard, startMeal, stepDay, supplementDay, weekDays, weekLabel, weekOf } from './nutritionBoard.js';

const TODAY = '2026-11-08'; // a Sunday
const supp = (over: Partial<Supplements> = {}): Supplements => ({ waterGoal: 64, waterMode: 'weight', water: {}, boost: {}, items: [], taken: {}, ...over });
const entry = (d: string, kcal: number, p: number, f?: number): DietEntry => ({ id: `${d}-${kcal}`, d, n: 'Food', kcal, p, ...(f !== undefined ? { f } : {}) });
const targets = { kcal: 2000, protein: 150, fat: 70 };
const view = (day: string, over: { diet?: DietEntry[]; supp?: Supplements; plan?: Record<string, { k: 'r'; id: string }[]>; recipes?: Recipe[] } = {}) =>
  dayView(day, TODAY, { plan: over.plan ?? {}, recipes: over.recipes ?? [], meals: [], diet: over.diet ?? [], supp: over.supp ?? supp(), body: [{ d: '2026-10-01', w: 160 }], targets });

describe('week days', () => {
  it('this week starts today; last week is the seven before; next week the seven after', () => {
    expect(weekDays(TODAY, 0)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']);
    expect(weekDays(TODAY, -1)[0]).toBe('2026-11-01');
    expect(weekDays(TODAY, -1)[6]).toBe('2026-11-07');
    expect(weekDays(TODAY, 1)[0]).toBe('2026-11-15');
    expect(weekDays(TODAY, 1)[6]).toBe('2026-11-21');
  });
  it('no day appears in two weeks', () => {
    const all = [-1, 0, 1].flatMap(o => weekDays(TODAY, o as -1 | 0 | 1));
    expect(new Set(all).size).toBe(21);
  });
  it('weekOf puts a day in its week', () => {
    expect(weekOf(TODAY, '2026-11-07')).toBe(-1);
    expect(weekOf(TODAY, TODAY)).toBe(0);
    expect(weekOf(TODAY, '2026-11-14')).toBe(0);
    expect(weekOf(TODAY, '2026-11-15')).toBe(1);
  });
  it('labels a week and a month crossing', () => {
    expect(weekLabel(TODAY, -1)).toBe('Last week · Nov 1 to 7');
    expect(weekLabel('2026-11-28', 0)).toBe('This week · Nov 28 to Dec 4');
  });
  it('the dropdown has three groups of seven and marks today', () => {
    const g = dayGroups(TODAY);
    expect(g.map(x => x.label)).toEqual(['Last week', 'This week', 'Next week']);
    expect(g.every(x => x.days.length === 7)).toBe(true);
    expect(g[1]!.days[0]!.label).toBe('Sun 8 · today');
  });
});

describe('stepping a day', () => {
  it('crosses weeks and stops at the ends', () => {
    expect(stepDay(TODAY, '2026-11-14', 1)).toBe('2026-11-15');
    expect(stepDay(TODAY, '2026-11-01', -1)).toBe('2026-11-01');
    expect(stepDay(TODAY, '2026-11-21', 1)).toBe('2026-11-21');
    expect(stepDay(TODAY, TODAY, -1)).toBe('2026-11-07');
  });
  it('knows what is on the board', () => {
    expect(onBoard(TODAY, '2026-11-01')).toBe(true);
    expect(onBoard(TODAY, '2026-10-31')).toBe(false);
    expect(onBoard(TODAY, '2026-11-21')).toBe(true);
    expect(onBoard(TODAY, '2026-11-22')).toBe(false);
  });
});

describe('meal by time of day', () => {
  const at = (h: number, m = 0) => mealByTime(h * 60 + m);
  it('follows the brief', () => {
    expect(at(7)).toBe('breakfast');
    expect(at(10, 29)).toBe('breakfast');
    expect(at(10, 30)).toBe('lunch');
    expect(at(14, 29)).toBe('lunch');
    expect(at(14, 30)).toBe('snack');
    expect(at(16, 29)).toBe('snack');
    expect(at(16, 30)).toBe('dinner');
    expect(at(21, 29)).toBe('dinner');
    expect(at(21, 30)).toBe('snack');
    expect(at(2)).toBe('breakfast');
  });
  it('the last pick wins', () => {
    expect(startMeal('dinner', 8 * 60)).toBe('dinner');
    expect(startMeal(null, 8 * 60)).toBe('breakfast');
  });
});

describe('the toolbar and what can be added', () => {
  it('names its target day', () => {
    expect(addingTo(TODAY, TODAY)).toBe('Adding to Sun 8 · today');
    expect(addingTo('2026-11-10', TODAY)).toBe('Adding to Tue 10');
  });
  it('last week is read-only for food; a day ahead plans; today logs', () => {
    expect(foodEditable('2026-11-07', TODAY)).toBe(false);
    expect(foodEditable(TODAY, TODAY)).toBe(true);
    expect(addFlows('2026-11-07', TODAY)).toEqual([]);
    expect(addFlows('2026-11-10', TODAY)).toEqual(['meals', 'recipes']);
    expect(addFlows(TODAY, TODAY)).toEqual(expect.arrayContaining(['quick', 'barcode', 'oneoff', 'find', 'meals', 'recipes']));
  });
});

describe('day meters', () => {
  it('count eaten food for last week and today, the plan for days ahead', () => {
    expect(basisOf('2026-11-07', TODAY)).toBe('eaten');
    expect(basisOf(TODAY, TODAY)).toBe('eaten');
    expect(basisOf('2026-11-09', TODAY)).toBe('planned');
    const recipes = [{ id: 'r1', n: 'Chili', kcal: 400, p: 30, f: 14, cat: 'protein' } as unknown as Recipe];
    const v = view('2026-11-09', { plan: { '2026-11-09': [{ k: 'r', id: 'r1' }] }, diet: [entry('2026-11-09', 999, 99)], recipes });
    expect(v.meters.find(m => m.key === 'kcal')!.value).toBe(400);
    expect(view('2026-11-07', { diet: [entry('2026-11-07', 1500, 120, 40), entry('2026-11-07', 500, 20, 10)] }).meters.find(m => m.key === 'kcal')!.value).toBe(2000);
  });
  it('today ignores the plan: only what was logged counts', () => {
    const recipes = [{ id: 'r1', n: 'Chili', kcal: 400, p: 30, f: 14 } as unknown as Recipe];
    const v = view(TODAY, { plan: { [TODAY]: [{ k: 'r', id: 'r1' }] }, diet: [entry(TODAY, 300, 20, 5)], recipes });
    expect(v.meters.find(m => m.key === 'kcal')!.value).toBe(300);
    expect(v.eaten).toHaveLength(1);
    expect(v.plan.slots.flatMap(s => s.items)).toHaveLength(1);
  });
  it('an empty day is zero against the targets, with a water goal from body weight', () => {
    const v = view('2026-11-10');
    expect(v.meters.map(m => [m.key, m.value])).toEqual([['kcal', 0], ['protein', 0], ['fat', 0], ['water', 0]]);
    expect(v.meters.find(m => m.key === 'water')!.target).toBe(80);
  });
  it('water counts drinks against that day\'s goal, and a hot day raises it', () => {
    const v = view(TODAY, { supp: supp({ water: { [TODAY]: [16.9, 12] }, boost: { [TODAY]: { hot: true } } }) });
    const w = v.meters.find(m => m.key === 'water')!;
    expect(w.value).toBe(28.9);
    expect(w.target).toBe(96);
  });
  it('past the target the meter is over and says by how much in its label', () => {
    const v = view('2026-11-07', { diet: [entry('2026-11-07', 2300, 100, 20)] });
    const k = v.meters[0]!;
    expect(k.over).toBe(true);
  });
  it('no targets: amounts, never over', () => {
    const v = dayView(TODAY, TODAY, { plan: {}, recipes: [], meals: [], diet: [entry(TODAY, 300, 20)], supp: supp(), body: [], targets: { kcal: null, protein: null, fat: null } });
    expect(v.meters[0]!.over).toBe(false);
    expect(v.meters[0]!.text).toBe('300 kcal');
    expect(v.meters[3]!.target).toBe(64); // no body weight: the 64 oz fallback
  });
  it('says carbs and fat count only what is entered when an entry lacks them', () => {
    expect(view(TODAY, { diet: [entry(TODAY, 300, 20)] }).fatNote).toMatch(/only what you enter/);
    expect(view(TODAY).fatNote).toBeNull();
  });
});

describe('hydration', () => {
  it('says what is left, or that the goal is met', () => {
    expect(hydrationView(TODAY, TODAY, supp({ water: { [TODAY]: [32] } }), [{ d: '2026-10-01', w: 160 }]).status).toBe('48 oz to go');
    expect(hydrationView(TODAY, TODAY, supp({ water: { [TODAY]: [80] } }), [{ d: '2026-10-01', w: 160 }]).status).toBe('Goal met');
  });
  it('a day ahead with nothing logged names its goal', () => {
    const h = hydrationView('2026-11-10', TODAY, supp(), [{ d: '2026-10-01', w: 160 }]);
    expect(h.status).toBe('Goal 80 oz');
    expect(h.future).toBe(true);
  });
  it('hot day and training are tags and goal lines, with a total', () => {
    const h = hydrationView(TODAY, TODAY, supp({ boost: { [TODAY]: { hot: true, mins: 60 } } }), [{ d: '2026-10-01', w: 160 }]);
    expect(h.tags).toEqual(['Hot day +16', 'Training 60 min +24']);
    expect(h.lines.map(l => l.oz)).toEqual([80, 16, 24]);
    expect(h.goal).toBe(120);
  });
  it('no body weight falls back to the 64 oz goal', () => {
    const h = hydrationView(TODAY, TODAY, supp(), []);
    expect(h.goal).toBe(64);
    expect(h.lines[0]!.label).toMatch(/no body weight/);
  });
});

describe('supplements for a day', () => {
  const items = [
    { id: 'a', n: 'Creatine', dose: '5 g', slot: 'morning' }, { id: 'b', n: 'Vitamin D', dose: '', slot: 'morning' },
    { id: 'c', n: 'Magnesium', dose: '400 mg', slot: 'night' }, { id: 'd', n: 'Spare', dose: '', slot: '' },
  ] as Supplements['items'];
  it('lists the three times of day with ticks and a count; library-only ones are left out', () => {
    const v = supplementDay(supp({ items, taken: { [TODAY]: { a: true } } }), TODAY);
    expect(v.slots.map(s => [s.label, s.items.length])).toEqual([['Morning', 2], ['Noon', 0], ['Night', 1]]);
    expect(v.text).toBe('1 of 3 taken');
    expect(v.slots[0]!.items[0]!.taken).toBe(true);
  });
  it('a past or future day has its own ticks', () => {
    const s = supp({ items, taken: { '2026-11-07': { a: true, b: true, c: true } } });
    expect(supplementDay(s, '2026-11-07').text).toBe('3 of 3 taken');
    expect(supplementDay(s, '2026-11-09').text).toBe('0 of 3 taken');
  });
  it('nothing scheduled says so', () => { expect(supplementDay(supp(), TODAY).text).toBe('Nothing scheduled'); });
});
