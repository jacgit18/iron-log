import { describe, expect, it } from 'vitest';
import type { DietEntry, Recipe, Supplements } from '../types.ts';
import { addFlows, addMode, addGroups, addingTo, mealAddShown, mealFlows, carbsMeter, mealForHour, mealFigures, mealKcalText, mealOverText, slotOverText, placeEaten, suppPickList, toolbarFlows, dayView, daysShown, foodEditable, hydrationView, mealByTime, meterLabel, onBoard, planLine, startMeal, suppMeter, supplementDay, weekDates, weekDays, weekLabel, weekOf, windowDays, oldestLogged, stepWeek, weekChoices, weekName, weekRange, dayOnArrival } from './nutritionBoard.js';

const TODAY = '2026-11-08'; // a Sunday
const supp = (over: Partial<Supplements> = {}): Supplements => ({ waterGoal: 64, waterMode: 'weight', water: {}, boost: {}, items: [], taken: {}, ...over });
const entry = (d: string, kcal: number, p: number, f?: number): DietEntry => ({ id: `${d}-${kcal}`, d, n: 'Food', kcal, p, ...(f !== undefined ? { f } : {}) });
const targets = { kcal: 2000, protein: 150, fat: 70 };
const view = (day: string, over: { diet?: DietEntry[]; supp?: Supplements; plan?: Record<string, { k: 'r'; id: string }[]>; recipes?: Recipe[] } = {}) =>
  dayView(day, TODAY, { plan: over.plan ?? {}, recipes: over.recipes ?? [], meals: [], diet: over.diet ?? [], supp: over.supp ?? supp(), body: [{ d: '2026-10-01', w: 160 }], targets });

describe('week days', () => {
  it('weeks run Sunday to Saturday: this week holds today, last week the one before, next week the one after', () => {
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
    expect(weekDates(TODAY, -1)).toBe('Nov 1 to 7');
    expect(weekDates('2026-12-01', 0)).toBe('Nov 29 to Dec 5');
    expect(weekLabel('2026-12-01', 0)).toBe('This week · Nov 29 to Dec 5');
  });
});

describe('a mid-week today', () => {
  const THU = '2026-11-12';
  it('this week still starts on Sunday, so the days before today stay on it', () => {
    expect(weekDays(THU, 0)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']);
    expect(weekDays(THU, -1)[0]).toBe('2026-11-01');
    expect(weekDays(THU, 1)[6]).toBe('2026-11-21');
    expect(weekOf(THU, '2026-11-09')).toBe(0);
    expect(weekOf(THU, '2026-11-15')).toBe(1);
    expect(weekLabel(THU, 0)).toBe('This week · Nov 8 to 14');
  });
  it('the board runs from last Sunday (or the oldest logged week) to the last week of the plan window; Saturday is a week end, Sunday the next start', () => {
    expect(onBoard(THU, '2026-11-01')).toBe(true);
    expect(onBoard(THU, '2026-10-31')).toBe(false);
    expect(onBoard(THU, '2026-10-31', '2026-10-20')).toBe(true);
    expect(onBoard(THU, '2026-11-21')).toBe(true);
    expect(onBoard(THU, '2027-11-13')).toBe(true); // 52 weeks (364 days) after Thu 2026-11-12 is Thu 2027-11-11; its week ends Sat 2027-11-13
    expect(onBoard(THU, '2027-11-14')).toBe(false);
    expect(weekOf('2026-11-14', '2026-11-14')).toBe(0); // Saturday is still this week; the next day starts next week
    expect(weekOf('2026-11-14', '2026-11-15')).toBe(1);
  });
});

describe('the board range', () => {
  it('knows what is on the board', () => {
    expect(onBoard(TODAY, '2026-11-01')).toBe(true);
    expect(onBoard(TODAY, '2026-10-31')).toBe(false);
    expect(onBoard(TODAY, '2026-11-21')).toBe(true);
    expect(onBoard(TODAY, '2026-11-22')).toBe(true); // weeks run on for 52 weeks now
    expect(onBoard(TODAY, '2027-11-14')).toBe(false);
  });
  it('week numbers reach any week, not only the three around today', () => {
    expect(weekOf(TODAY, '2026-12-06')).toBe(4);
    expect(weekOf(TODAY, '2026-10-04')).toBe(-5);
    expect(weekDays(TODAY, 4)[0]).toBe('2026-12-06');
    expect(weekDays(TODAY, -5)[6]).toBe('2026-10-10');
    expect(weekOf(TODAY, weekDays(TODAY, 30)[3]!)).toBe(30);
  });
  it('the range ends 52 weeks ahead and, with nothing logged, at last week', () => {
    expect(weekRange(TODAY)).toEqual({ min: -1, max: 52 });
    expect(weekRange('2026-11-14')).toEqual({ min: -1, max: 52 });
    expect(weekRange('2026-11-08')).toEqual({ min: -1, max: 52 });
  });
  it('the range reaches back to the oldest logged week and no further than the log keeps', () => {
    expect(weekRange(TODAY, '2026-10-04').min).toBe(-5);
    expect(weekRange(TODAY, '2026-10-31').min).toBe(-2);
    expect(weekRange(TODAY, '2026-11-09').min).toBe(-1); // a recent entry never shortens it below last week
    expect(weekRange(TODAY, '2020-01-01').min).toBeGreaterThan(-60);
    expect(oldestLogged([{ d: '2026-11-03' }, { d: '2026-10-04' }, { d: '2026-11-09' }])).toBe('2026-10-04');
    expect(oldestLogged([])).toBeUndefined();
  });
  it('a step stops at both ends', () => {
    const r = weekRange(TODAY, '2026-10-04');
    expect(stepWeek(0, -1, r)).toBe(-1);
    expect(stepWeek(-5, -1, r)).toBeNull();
    expect(stepWeek(52, 1, r)).toBeNull();
    expect(stepWeek(51, 1, r)).toBe(52);
  });
  it('names far weeks by distance and lists every week once', () => {
    expect(weekName(0)).toBe('This week');
    expect(weekName(1)).toBe('Next week');
    expect(weekName(5)).toBe('In 5 weeks');
    expect(weekName(-3)).toBe('3 weeks ago');
    const list = weekChoices(TODAY, { min: -2, max: 52 });
    expect(list).toHaveLength(55);
    expect(list[0]!.offset).toBe(-2);
    expect(list.find(c => c.offset === 0)!.label).toBe('This week · Nov 8 to 14');
    expect(new Set(list.map(c => c.dates)).size).toBe(55);
  });
  it('arriving on a week shows today in this week and the first day of any other', () => {
    expect(dayOnArrival(TODAY, 0)).toBe(TODAY);
    expect(dayOnArrival(TODAY, 3)).toBe('2026-11-29');
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
  it('an earlier day and today log eaten food, a day ahead plans (the day-to-log rule)', () => {
    expect(addMode('2026-11-07', TODAY)).toBe('log');
    expect(addMode(TODAY, TODAY)).toBe('log');
    expect(addMode('2026-11-09', TODAY)).toBe('plan');
    expect(addFlows('2026-11-07', TODAY, 2)).toEqual(addFlows(TODAY, TODAY, 2));
    expect(foodEditable('2026-11-07', TODAY)).toBe(false); // an earlier day has no planned meals to tick (its eaten rows still open the row sheet)
    expect(foodEditable(TODAY, TODAY)).toBe(true);
    expect(addFlows('2026-11-10', TODAY, 0)).toEqual(['meals', 'recipes']);
    expect(addFlows('2026-11-10', TODAY, 3)).toEqual(['meals', 'recipes']); // a day ahead never had the save row
    expect(addFlows(TODAY, TODAY, 1)).toEqual(expect.arrayContaining(['quick', 'barcode', 'oneoff', 'find', 'meals', 'recipes']));
  });
  it('the toolbar shortcuts follow the day: today and an earlier day log (scan only: Quick add and One-off food are in the Add food menu), a day ahead plans, and each is a way the add sheet offers', () => {
    expect(toolbarFlows(TODAY, TODAY)).toEqual(['barcode']);
    expect(toolbarFlows('2026-11-12', TODAY)).toEqual(['recipes', 'meals']);
    expect(toolbarFlows('2026-11-07', TODAY)).toEqual(['barcode']);
    for (const d of ['2026-11-07', TODAY, '2026-11-12']) for (const f of toolbarFlows(d, TODAY)) expect(addFlows(d, TODAY, 0)).toContain(f);
  });
});

describe('day meters', () => {
  it('count only eaten food on every day; a day ahead reads 0 whatever is planned', () => {
    const recipes = [{ id: 'r1', n: 'Chili', kcal: 400, p: 30, f: 14, cat: 'protein' } as unknown as Recipe];
    const ahead = view('2026-11-09', { plan: { '2026-11-09': [{ k: 'r', id: 'r1' }] }, recipes });
    expect(ahead.meters.filter(m => m.key !== 'water').map(m => m.value)).toEqual([0, 0, 0, 0]);
    expect(ahead.meters.find(m => m.key === 'kcal')!.text).toBe('0 / 2,000 kcal');
    expect(view('2026-11-09', { plan: { '2026-11-09': [{ k: 'r', id: 'r1' }] }, diet: [entry('2026-11-09', 999, 99)], recipes }).meters.find(m => m.key === 'kcal')!.value).toBe(999);
    expect(view('2026-11-07', { diet: [entry('2026-11-07', 1500, 120, 40), entry('2026-11-07', 500, 20, 10)] }).meters.find(m => m.key === 'kcal')!.value).toBe(2000);
  });
  it('a meter label never says planned', () => {
    expect(meterLabel(view('2026-11-09').meters[0]!, 'future')).toMatch(/^Calories eaten so far: 0 \/ 2,000 kcal/);
    expect(meterLabel(view('2026-11-07').meters[0]!, 'past')).toMatch(/^Calories eaten: /);
  });
  it('the plan line shows the planned totals on a day ahead only', () => {
    const recipes = [{ id: 'r1', n: 'Chili', kcal: 400, p: 30, f: 14, cat: 'protein' } as unknown as Recipe];
    const plan = { '2026-11-09': [{ k: 'r' as const, id: 'r1' }], [TODAY]: [{ k: 'r' as const, id: 'r1' }] };
    expect(view('2026-11-09', { plan, recipes }).planLine).toBe('Planned: 400 kcal · 30 g protein · 14 g fat');
    expect(view(TODAY, { plan, recipes }).planLine).toBeNull();
    expect(view('2026-11-07', { plan, recipes }).planLine).toBeNull();
    expect(view('2026-11-10', { plan, recipes }).planLine).toBeNull(); // nothing planned that day
  });
  it('the plan line says fat is not entered when no planned food has it, and counts the foods that do', () => {
    const none = { id: 'r1', n: 'Chili', kcal: 400, p: 30, cat: 'protein' } as unknown as Recipe;
    expect(view('2026-11-09', { plan: { '2026-11-09': [{ k: 'r', id: 'r1' }] }, recipes: [none] }).planLine).toBe('Planned: 400 kcal · 30 g protein · fat not entered');
    const rice = { id: 'r2', n: 'Rice', kcal: 100, p: 4, cat: 'carb' } as unknown as Recipe; // no fat entered
    const chili = { id: 'r1', n: 'Chili', kcal: 400, p: 30, f: 14, cat: 'protein' } as unknown as Recipe;
    const v = view('2026-11-09', { plan: { '2026-11-09': [{ k: 'r', id: 'r1' }, { k: 'r', id: 'r2' }] }, recipes: [chili, rice] }); // fat covers 80% of the calories: partial (FAT_PARTIAL_FROM is 0.7)
    expect(v.planLine).toBe('Planned: 500 kcal · 34 g protein · 14 g fat (1 of 2 foods have fat)');
  });
  it('planLine is null with nothing planned', () => {
    expect(planLine(view('2026-11-09').plan, true)).toBeNull();
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
    expect(v.meters.map(m => [m.key, m.value])).toEqual([['kcal', 0], ['protein', 0], ['carbs', 0], ['fat', 0], ['water', 0]]);
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
    expect(v.meters.find(m => m.key === 'water')!.target).toBe(64); // no body weight: the 64 oz fallback
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

describe('the Supplements meter', () => {
  const items = [
    { id: 'a', n: 'Creatine', dose: '5 g', slot: 'morning' }, { id: 'b', n: 'Vitamin D', dose: '', slot: 'morning' },
    { id: 'c', n: 'Zinc', dose: '', slot: 'noon' }, { id: 'd', n: 'Magnesium', dose: '400 mg', slot: 'night' },
  ] as Supplements['items'];
  it('"2 of 4 taken" fills half the bar and says so for a screen reader', () => {
    const m = suppMeter(supp({ items, taken: { [TODAY]: { a: true, d: true } } }), TODAY);
    expect([m.done, m.total, m.pct, m.text, m.label]).toEqual([2, 4, 50, '2 of 4 taken', 'Supplements taken: 2 of 4 taken']);
  });
  it('all taken is a full bar; a day ahead starts empty', () => {
    expect(suppMeter(supp({ items, taken: { [TODAY]: { a: true, b: true, c: true, d: true } } }), TODAY)).toMatchObject({ pct: 100, text: '4 of 4 taken' });
    expect(suppMeter(supp({ items }), '2026-11-10')).toMatchObject({ pct: 0, text: '0 of 4 taken' });
  });
  it('nothing scheduled is an empty bar that says "None scheduled"', () => {
    expect(suppMeter(supp(), TODAY)).toMatchObject({ total: 0, pct: 0, text: 'None scheduled' });
    expect(suppMeter(supp({ items: [{ id: 'x', n: 'Spare', dose: '', slot: '' }] as Supplements['items'] }), TODAY).total).toBe(0);
  });
  it('rides on the day view next to the five food and water meters', () => {
    const v = view(TODAY, { supp: supp({ items, taken: { [TODAY]: { a: true } } }) });
    expect(v.supps.text).toBe('1 of 4 taken');
    expect(v.meters).toHaveLength(5);
  });
});

describe('daysShown', () => {
  it('shows seven from 1440, three from 1000, two from 768, else one', () => {
    expect([375, 767, 768, 999, 1000, 1439, 1440, 2560].map(daysShown)).toEqual([1, 1, 2, 2, 3, 3, 7, 7]);
  });
});

describe('windowDays', () => {
  const week = weekDays(TODAY, 0);
  it('starts at the picked day and takes the days after it', () => {
    expect(windowDays(week, week[2]!, 3)).toEqual(week.slice(2, 5));
  });
  it('holds the window inside the week: the last day shows the days before it', () => {
    expect(windowDays(week, week[6]!, 3)).toEqual(week.slice(4, 7));
    expect(windowDays(week, week[6]!, 2)).toEqual(week.slice(5, 7));
  });
  it('one day is the picked day; a day outside the week starts at the first', () => {
    expect(windowDays(week, week[3]!, 1)).toEqual([week[3]]);
    expect(windowDays(week, '2000-01-01', 2)).toEqual(week.slice(0, 2));
  });
});

describe('addGroups', () => {
  it('today lists every way in three labelled groups, each way once', () => {
    const g = addGroups(TODAY, TODAY, 2);
    expect(g.map(x => x.label)).toEqual(['Fastest', 'From what you have', 'Whole days and meals']);
    expect(g.flatMap(x => x.flows).sort()).toEqual([...addFlows(TODAY, TODAY, 2)].sort());
  });
  it('a day with nothing eaten has no Save as a meal row and keeps every other row', () => {
    for (const d of [TODAY, '2026-11-01']) {
      const g = addGroups(d, TODAY, 0);
      expect(g.flatMap(x => x.flows)).not.toContain('savemeal');
      expect(g.flatMap(x => x.flows).sort()).toEqual(['barcode', 'copy', 'find', 'meals', 'oneoff', 'quick', 'recipes']);
      expect(g.find(x => x.label === 'Whole days and meals')?.flows).toEqual(['meals', 'copy']);
    }
    expect(addFlows(TODAY, TODAY, 0)).not.toContain('savemeal');
    expect(addFlows(TODAY, TODAY, 1)).toContain('savemeal');
  });
  it('one eaten food brings the row back, in the same group', () => {
    expect(addGroups(TODAY, TODAY, 1).find(x => x.label === 'Whole days and meals')?.flows).toEqual(['meals', 'copy', 'savemeal']);
  });
  it('a day ahead keeps only the groups that hold a way to plan', () => {
    const g = addGroups('2026-11-10', TODAY, 0);
    expect(g.map(x => x.label)).toEqual(['From what you have', 'Whole days and meals']);
    expect(g.flatMap(x => x.flows)).toEqual(['recipes', 'meals']);
  });
  it('an earlier day lists the same ways as today', () => {
    expect(addGroups('2026-11-01', TODAY, 2)).toEqual(addGroups(TODAY, TODAY, 2));
  });
});

describe('eaten food in meals (brief nutrition-items-row-sheet-and-more)', () => {
  const at = (id: string, t: number | undefined, kcal = 100): DietEntry => ({ id, d: TODAY, n: id, kcal, p: 1, ...(t !== undefined ? { t } : {}) });
  const emptyPlan = view(TODAY).plan;
  it('the hour picks the meal: Breakfast before 11, Lunch before 16, Dinner before 22, else Snack', () => {
    expect([0, 8, 10].map(mealForHour)).toEqual(['breakfast', 'breakfast', 'breakfast']);
    expect([11, 13, 15].map(mealForHour)).toEqual(['lunch', 'lunch', 'lunch']);
    expect([16, 18, 21].map(mealForHour)).toEqual(['dinner', 'dinner', 'dinner']);
    expect([22, 23].map(mealForHour)).toEqual(['snack', 'snack']);
  });
  it('an unplanned food logged at 8:00 lands in Breakfast, one with no hour in "Not in a meal"', () => {
    const p = placeEaten(TODAY, TODAY, [at('a', 8), at('b', undefined), at('c', 12)], emptyPlan);
    expect(p.meals.breakfast.map(e => e.id)).toEqual(['a']);
    expect(p.meals.lunch.map(e => e.id)).toEqual(['c']);
    expect(p.none.map(e => e.id)).toEqual(['b']);
  });
  it('food logged from a recipe with a usual meal goes to that meal ahead of the hour; on a past day, which draws no meals, it stays in "Not in a meal"', () => {
    const recipes = [{ id: 'cereal', meal: 'breakfast' as const }];
    const now = placeEaten(TODAY, TODAY, [{ ...at('a', 20), from: 'cereal' }, at('b', undefined)], emptyPlan, recipes);
    expect(now.meals.breakfast.map(e => e.id)).toEqual(['a']);
    expect(now.none.map(e => e.id)).toEqual(['b']);
    const past = '2026-11-05';
    const old = placeEaten(past, TODAY, [{ ...at('a', 20), d: past, from: 'cereal' }], emptyPlan, recipes);
    expect(old.none.map(e => e.id)).toEqual(['a']);
    expect(Object.values(old.meals).flat()).toEqual([]);
  });
  it('food logged into a meal (its own s) stays there ahead of its food\'s usual meal and the hour; on a past day it still goes to "Not in a meal"', () => {
    const recipes = [{ id: 'cereal', meal: 'breakfast' as const }];
    const now = placeEaten(TODAY, TODAY, [{ ...at('a', 20), from: 'cereal', s: 'lunch' }, { ...at('b', undefined), s: 'snack' }], emptyPlan, recipes);
    expect(now.meals.lunch.map(e => e.id)).toEqual(['a']);
    expect(now.meals.snack.map(e => e.id)).toEqual(['b']);
    expect(now.none).toEqual([]);
    const past = '2026-11-05';
    const old = placeEaten(past, TODAY, [{ ...at('a', 20), d: past, s: 'lunch' }], emptyPlan);
    expect(old.none.map(e => e.id)).toEqual(['a']);
    expect(Object.values(old.meals).flat()).toEqual([]);
  });
  it('every entry on a past day goes to "Not in a meal", hour or not', () => {
    const past = '2026-11-05';
    const p = placeEaten(past, TODAY, [{ ...at('a', 8), d: past }, { ...at('b', undefined), d: past }], emptyPlan);
    expect(p.none.map(e => e.id)).toEqual(['a', 'b']);
    expect(Object.values(p.meals).flat()).toEqual([]);
  });
  it('food a planned item\'s check added is not placed twice: no entry lost, none duplicated', () => {
    const plan = { ...emptyPlan, slots: [{ slot: 'lunch' as const, items: [{ index: 0, fat: undefined, r: { item: { k: 'r' as const, id: 'x', e: ['a'] }, name: 'Soup', gone: false, portion: 1 } }], kcal: 0, share: null, need: [], have: [], fixes: [] }] };
    const p = placeEaten(TODAY, TODAY, [at('a', 12), at('b', 12)], plan);
    expect(p.meals.lunch.map(e => e.id)).toEqual(['b']);
    expect(p.none).toEqual([]);
  });
  it('dayView carries the placement and keeps the day totals', () => {
    const diet = [at('a', 8, 300), at('b', undefined, 200)];
    const v = view(TODAY, { diet });
    expect(v.placed.meals.breakfast).toHaveLength(1);
    expect(v.placed.none).toHaveLength(1);
    expect(v.meters.find(m => m.key === 'kcal')!.value).toBe(500);
  });
  it('a meal line tells the menu in words and counts only eaten calories (wording A)', () => {
    expect(mealKcalText({ items: 4, planned: 0, anyEaten: false }, 0)).toBe('4 on the menu'); // no target, nothing eaten: nothing is compared
    expect(mealKcalText({ items: 4, planned: 2, anyEaten: false }, 0)).toBe('4 on the menu · 2 planned');
    expect(mealKcalText({ items: 4, planned: 2, anyEaten: true }, 245)).toBe('245 kcal eaten · 2 planned');
    expect(mealKcalText({ items: 0, planned: 0, anyEaten: true }, 150)).toBe('150 kcal eaten');
    expect(mealKcalText({ items: 0, planned: 0, anyEaten: false }, 0)).toBe('');
    expect(mealKcalText({ items: 3, planned: 0, anyEaten: true }, 1234)).toBe('1,234 kcal eaten');
  });
  it('a ticked item with no calories still reads "0 kcal eaten" (review follow-up to ADR 139)', () => {
    expect(mealKcalText({ items: 2, planned: 0, anyEaten: true }, 0)).toBe('0 kcal eaten');
    expect(mealKcalText({ items: 2, planned: 1, anyEaten: true }, 0)).toBe('0 kcal eaten · 1 planned');
    expect(mealKcalText({ items: 2, planned: 1, anyEaten: false }, 0)).toBe('2 on the menu · 1 planned');
  });
  it('mealFigures says something was eaten for a ticked item with no kcal, and for unplanned eaten food with 0 kcal', () => {
    const it = (id: string, e?: string[], kcal?: number) => ({ r: { item: { k: 'r' as const, id, ...(e ? { e } : {}) }, ...(kcal === undefined ? {} : { kcal }) } }) as never;
    const diet = [{ id: 'log1', kcal: 0 } as DietEntry];
    expect(mealFigures([it('a', ['log1'])], [], diet).anyEaten).toBe(true);
    expect(mealFigures([it('a', ['log1'])], [], diet).eatenKcal).toBe(0);
    expect(mealFigures([it('a')], [], diet).anyEaten).toBe(false); // listed but not ticked
    expect(mealFigures([it('a', ['gone'])], [], diet).anyEaten).toBe(false); // its log entry is gone
    expect(mealFigures([], [{ id: 'x', kcal: 0 } as DietEntry], []).anyEaten).toBe(true);
  });
  it('the "Not set" group never warns, even if a share and a lot of eaten food are passed for it (by design)', () => {
    expect(slotOverText(null, 100, 5000, 'Not set')).toBeNull(); // fails if the Not set group is ever given a warning
    expect(slotOverText(null, null, 5000, 'Not set')).toBeNull();
    expect(slotOverText('snack', 220, 245, 'Snack')).toBe('25 over snack share'); // a meal still warns
    expect(slotOverText('snack', null, 245, 'Snack')).toBeNull();
  });
  it('mealFigures counts only eaten calories and only items that can be planned', () => {
    const it = (id: string, p?: true, s?: 'snack') => ({ r: { item: { k: 'r' as const, id, ...(p ? { p } : {}), ...(s ? { s } : {}) }, kcal: 100 } }) as never;
    const items = [it('a', true), it('b'), it('tea', true), it('yog', true, 'snack')];
    const ate: DietEntry[] = [];
    const f = mealFigures(items, [{ id: 'x', kcal: 50 } as DietEntry], ate, [{ id: 'yog' }], new Set(['tea']));
    expect(f.planned).toBe(1); // a drink and a listed snack with a stray marker are not planned things
    expect(f.eatenKcal).toBe(50); // nothing ticked: only the unplanned eaten food
  });
  it('the over-share warning needs a share and eaten food past it, never unticked food', () => {
    expect(mealOverText(220, 245, 'Snack')).toBe('25 over snack share');
    expect(mealOverText(220, 220, 'Snack')).toBeNull();
    expect(mealOverText(220, 0, 'Snack')).toBeNull(); // 625 kcal of unticked food is never passed in
    expect(mealOverText(null, 900, 'Snack')).toBeNull(); // no target: no warning at all
  });
});

describe('carbs meter', () => {
  it('shows with a target only, with data only, and with both', () => {
    const t = carbsMeter(false, 0, 250);
    expect([t.hidden, t.text, t.over]).toEqual([undefined, '0 / 250 g', false]);
    const d = carbsMeter(false, 40, null);
    expect([d.hidden, d.text]).toEqual([undefined, '40 g']);
    expect(carbsMeter(false, 40, 250).text).toBe('40 / 250 g');
  });
  it('is hidden, with a note like fat\'s, with neither a target nor carbs', () => {
    const n = carbsMeter(false, 0, null);
    expect(n.hidden).toBe(true);
    expect(n.note).toMatch(/carbs/i);
  });
  it('turns over its target', () => {
    expect(carbsMeter(false, 300, 250).over).toBe(true);
    expect(carbsMeter(false, 250, 250).over).toBe(false);
  });
  it('a day ahead counts the log like any day; with neither target nor carbs it is hidden without a note', () => {
    expect(carbsMeter(true, 0, 250).hidden).toBeUndefined();
    expect(carbsMeter(true, 0, 250).text).toBe('0 / 250 g');
    expect(carbsMeter(true, 40, null).text).toBe('40 g');
    expect(carbsMeter(true, 0, null).hidden).toBe(true);
    expect(carbsMeter(true, 0, null).note).toBeUndefined();
  });
  it('sits after protein and before fat in a day', () => {
    const v = dayView(TODAY, TODAY, { plan: {}, recipes: [], meals: [], diet: [{ ...entry(TODAY, 300, 20), c: 40 }], supp: supp(), body: [], targets: { ...targets, carbs: 250 } });
    expect(v.meters.map(m => m.key)).toEqual(['kcal', 'protein', 'carbs', 'fat', 'water']);
    expect(v.meters[2]!.value).toBe(40);
  });
});

describe('supplements taken through the Add button', () => {
  const lib = supp({ items: [{ id: 'mag', n: 'Magnesium', slot: '', dose: '200 mg' }, { id: 'd3', n: 'D3', slot: 'morning' }, { id: 'zn', n: 'Zinc', slot: '' }] });
  it('the picker offers library-only supplements not yet taken that day', () => {
    expect(suppPickList(lib, TODAY).map(i => i.id)).toEqual(['mag', 'zn']);
    expect(suppPickList({ ...lib, taken: { [TODAY]: { mag: true } } }, TODAY).map(i => i.id)).toEqual(['zn']);
    expect(suppPickList({ ...lib, taken: { [TODAY]: { mag: true } } }, '2026-11-09').map(i => i.id)).toEqual(['mag', 'zn']);
  });
  it('a ticked library-only supplement is listed under the ticks and counted', () => {
    const d = supplementDay({ ...lib, taken: { [TODAY]: { mag: true } } }, TODAY);
    expect(d.extra.map(e => e.id)).toEqual(['mag']);
    expect(d.text).toBe('1 of 2 taken'); // D3 is scheduled and not ticked; Magnesium is the extra one
    expect(supplementDay(lib, TODAY).extra).toEqual([]);
  });
});

describe('mealFlows: the ways that log into a pressed meal', () => {
  it('keeps Quick add, One-off, Find food, Saved meals and Recipes; leaves out the scan, Copy yesterday and Save as a meal', () => {
    expect(mealFlows(addFlows('2026-09-24', '2026-09-24', 3))).toEqual(['quick', 'oneoff', 'find', 'meals', 'recipes']);
  });
});

describe('mealAddShown: a meal\'s own Add button', () => {
  const today = '2026-09-24';
  it('shows on a day ahead, for every real meal', () => {
    for (const m of ['breakfast', 'lunch', 'dinner', 'snack'] as const) expect(mealAddShown(m, '2026-09-25', today)).toBe(true);
  });
  it('shows today for every real meal (it logs into the meal pressed), and never on an earlier day, which draws no meals', () => {
    for (const m of ['breakfast', 'lunch', 'dinner', 'snack'] as const) expect(mealAddShown(m, today, today)).toBe(true);
    expect(mealAddShown('lunch', '2026-09-23', today)).toBe(false);
  });
  it('is off for the "Not set" group (no meal)', () => {
    expect(mealAddShown(null, '2026-09-25', today)).toBe(false);
    expect(mealAddShown(undefined, '2026-09-25', today)).toBe(false);
  });
});
