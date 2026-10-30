import { describe, expect, it } from 'vitest';
import { macrosFor, maxRate, recommend, targetNote, targetsFor } from './dietTarget.js';

const bulk = (kcal: number, plan: object) => ({ kind: 'ok', direction: 'bulk', kcal, protein: 150, plan });

describe('recommend: calories from current weight and the goal', () => {
  it('bulk with no goal date: maintenance (15 per lb) plus 250 a day for 0.5 lb a week', () => {
    expect(recommend(185, 170)).toMatchObject(bulk(2800, { maintenance: 2550, change: 250, rate: 0.5, weeksToGoal: 30, capped: false }));
  });
  it('a goal date sets the pace: 15 lb in 20 weeks is 0.75 lb a week, 375 a day', () => {
    expect(recommend(185, 170, 20)).toMatchObject(bulk(2925, { maintenance: 2550, change: 375, rate: 0.75, weeksToGoal: 20, capped: false }));
  });
  it('a date that needs more than 1 lb a week is held at 1 lb (500 a day) and says so', () => {
    expect(recommend(185, 170, 5)).toMatchObject(bulk(3050, { maintenance: 2550, change: 500, rate: 1, weeksToGoal: 15, capped: true }));
  });
  it('a far-off date is held at 0.25 lb a week', () => {
    expect(recommend(185, 170, 100)).toMatchObject(bulk(2675, { maintenance: 2550, change: 125, rate: 0.25, weeksToGoal: 60, capped: false }));
  });
  it('a date in the past or today uses the default pace, and the plan says the date passed', () => {
    expect(recommend(185, 170, 0)).toMatchObject({ plan: { rate: 0.5, datePassed: true } });
    expect(recommend(185, 170, -3)).toMatchObject({ plan: { rate: 0.5, datePassed: true } });
    expect(recommend(185, 170)).toMatchObject({ plan: { rate: 0.5 } });
    expect(recommend(185, 170)).not.toMatchObject({ plan: { datePassed: true } });
  });
  it('the pace is a clean multiple of 0.05 (7 lb in 20 weeks is 0.35, not 0.35000000000000003)', () => {
    const r = recommend(177, 170, 20);
    expect(r).toMatchObject({ kind: 'ok', plan: { rate: 0.35, change: 175 } });
    for (const w of [4, 6, 7, 9, 11, 13, 17, 19, 23, 29]) expect(String((recommend(185, 170, w) as { plan: { rate: number } }).plan.rate)).toMatch(/^\d(\.\d{1,2})?$/);
  });
  it('protein is 0.8 g per lb of goal weight', () => {
    expect(recommend(200, 140)).toMatchObject({ protein: 160 });
  });
  it('maintain inside 2 lb either way: maintenance of the current weight, no surplus', () => {
    expect(recommend(180, 179)).toMatchObject({ direction: 'maintain', kcal: 2675, plan: { maintenance: 2675, change: 0, rate: 0 } });
    expect(recommend(180, 182)).toMatchObject({ direction: 'maintain', kcal: 2725 });
  });
  it('no goal gives none', () => {
    expect(recommend(undefined, 170)).toEqual({ kind: 'none', reason: 'no-goal' });
    expect(recommend(0, 170)).toEqual({ kind: 'none', reason: 'no-goal' });
  });
  it('no weight logged: from the goal weight alone, no direction, no plan', () => {
    expect(recommend(185, null)).toEqual({ kind: 'ok', direction: null, kcal: 2775, protein: 150, plan: null });
  });
});

describe('recommend: cutting and the pace you pick', () => {
  const cut = (w: number, g: number, wk?: number | null, c?: Parameters<typeof recommend>[3]) => recommend(g, w, wk, c) as Extract<ReturnType<typeof recommend>, { kind: 'ok' }>;
  it('cut with no date and nothing picked: Steady is 1 lb a week, 500 a day', () => {
    expect(cut(180, 165)).toMatchObject({ direction: 'cut', kcal: 2200, protein: 130, plan: { maintenance: 2700, change: -500, rate: 1, weeksToGoal: 15, capped: false, from: 'default' } });
    expect(macrosFor(2200, 130)).toEqual({ fat: 60, carbs: 285 });
  });
  it('gain presets are 0.25, 0.5 and 1 lb a week; lose presets 0.5, 1 and 1.5', () => {
    expect(cut(170, 185, null, { pace: 'fast' })).toMatchObject({ kcal: 3050, plan: { change: 500, rate: 1, from: 'pick' } });
    expect(cut(170, 185, null, { pace: 'slow' })).toMatchObject({ kcal: 2675, plan: { rate: 0.25 } });
    expect(cut(180, 165, null, { pace: 'slow' })).toMatchObject({ kcal: 2450, plan: { rate: 0.5 } });
    expect(cut(250, 220, null, { pace: 'fast' })).toMatchObject({ kcal: 3000, plan: { change: -750, rate: 1.5 } });
  });
  it('a cut goal date sets the pace until a preset is picked', () => {
    expect(cut(180, 165, 15)).toMatchObject({ kcal: 2200, plan: { rate: 1, from: 'date', capped: false } });
    expect(cut(180, 165, 15, { pace: 'slow' })).toMatchObject({ kcal: 2450, plan: { rate: 0.5, from: 'pick' } });
    expect(cut(250, 220, 8)).toMatchObject({ plan: { rate: 1.5, capped: true, limit: 1.5, from: 'date' } });
    expect(cut(180, 165, 8)).toMatchObject({ kcal: 2025, plan: { rate: 1.35, floor: 2025, capped: false } }); // 1.9 lb a week is asked for, the floor holds it
    expect(cut(180, 165, 100)).toMatchObject({ plan: { rate: 0.25, from: 'date' } });
  });
  it('a custom pace is held to the limit and says so', () => {
    expect(cut(250, 220, null, { pace: 'custom', rate: 3 })).toMatchObject({ plan: { rate: 1.5, capped: true, limit: 1.5 } });
    expect(cut(170, 185, null, { pace: 'custom', rate: 3 })).toMatchObject({ plan: { rate: 1, capped: true, limit: 1 } });
    expect(cut(180, 165, null, { pace: 'custom', rate: 0.75 })).toMatchObject({ kcal: 2325, plan: { rate: 0.75, capped: false } });
    expect(cut(180, 165, null, { pace: 'custom' })).toMatchObject({ plan: { rate: 1, from: 'default' } }); // a custom pick with no number falls back
  });
  it('a loss is held to 1.5 lb and to 1% of body weight a week; a gain to 1 lb', () => {
    expect([maxRate('cut', 120), maxRate('cut', 149), maxRate('cut', 250), maxRate('bulk', 120)]).toEqual([1.2, 1.45, 1.5, 1]);
  });
  it('a cut never goes below 1,500 or 75% of maintenance, and says it was held', () => {
    expect(cut(120, 100, null, { pace: 'fast' })).toMatchObject({ kcal: 1500, plan: { maintenance: 1800, rate: 0.6, floor: 1500, capped: false } });
    expect(cut(180, 165, null, { pace: 'fast' })).toMatchObject({ kcal: 2025, plan: { maintenance: 2700, rate: 1.35, floor: 2025 } }); // at most a quarter off maintenance
    expect((cut(250, 220, null, { pace: 'fast' }).plan as { floor?: number }).floor).toBeUndefined(); // a heavy person is nowhere near the floor
  });
  it('a very light person is held at maintenance, not pushed up to the floor', () => {
    expect(cut(90, 80, null, { pace: 'slow' })).toMatchObject({ kcal: 1350, plan: { change: 0, rate: 0, weeksToGoal: null, floor: 1500 } });
  });
  it('a passed goal date uses Steady and says so, for a cut as well', () => {
    expect(cut(180, 165, 0)).toMatchObject({ plan: { rate: 1, datePassed: true } });
  });
});

describe('macrosFor', () => {
  it('fat is 25% of the calories and carbs fill the rest', () => {
    expect(macrosFor(2800, 150)).toEqual({ fat: 80, carbs: 370 });
  });
  it('a typed fat changes the carbs, and carbs never go below 0', () => {
    expect(macrosFor(3000, 150, 70)).toEqual({ fat: 70, carbs: 445 });
    expect(macrosFor(800, 200)).toEqual({ fat: 20, carbs: 0 });
  });
});

describe('targetNote: cut and pace', () => {
  it('says minus and lose for a cut, with the weeks to the goal', () => {
    expect(targetNote(recommend(165, 180), 165)).toBe('An estimate to start from, not medical advice. About 2,700 to stay the same, minus 500 a day to lose about 1 lb a week; about 15 weeks to 165 lb.');
  });
  it('says plus and gain with the 170 to 185 lb example', () => {
    expect(targetNote(recommend(185, 170), 185)).toContain('About 2,550 to stay the same, plus 250 a day to gain about 0.5 lb a week; about 30 weeks to 185 lb.');
  });
  it('says a capped pick or date is more than is advised, and a held floor', () => {
    expect(targetNote(recommend(220, 250, 8), 220)).toContain('Your goal date needs more than 1.5 lb a week, which is more than is advised, so this uses 1.5.');
    expect(targetNote(recommend(220, 250, null, { pace: 'custom', rate: 3 }), 220)).toContain('1.5 lb a week is the most that is advised, so this uses 1.5.');
    expect(targetNote(recommend(100, 120, null, { pace: 'fast' }), 100)).toContain('Calories are held at 1,500');
  });
});

describe('targetNote: a very light person', () => {
  it('says the weight is held, not "minus 0 a day to lose about 0 lb"', () => {
    const note = targetNote(recommend(80, 90, null, { pace: 'slow' }), 80);
    expect(note).toContain('About 1,350 calories keeps your weight where it is.');
    expect(note).not.toMatch(/minus 0|about 0 lb/);
  });
});

describe('targetNote', () => {
  it('says why there is no recommendation', () => {
    expect(targetNote({ kind: 'none', reason: 'no-goal' }, null)).toMatch(/Set a goal weight/);
  });
  it('shows maintenance, the surplus, the pace and the weeks to the goal', () => {
    expect(targetNote(recommend(185, 170), 185)).toBe('An estimate to start from, not medical advice. About 2,550 to stay the same, plus 250 a day to gain about 0.5 lb a week; about 30 weeks to 185 lb.');
  });
  it('writes a clean pace and says when the goal date has passed', () => {
    expect(targetNote(recommend(177, 170, 20), 177)).toContain('gain about 0.35 lb a week');
    expect(targetNote(recommend(185, 170, -2), 185)).toContain('Your goal date has passed, so this uses 0.5 lb a week.');
    expect(targetNote(recommend(185, 170), 185)).not.toContain('has passed');
  });
  it('says so when the goal date needs more than 1 lb a week', () => {
    expect(targetNote(recommend(185, 170, 5), 185)).toContain('more than is advised, so this uses 1');
  });
  it('maintaining and no-weight wording', () => {
    expect(targetNote(recommend(180, 180), 180)).toBe('An estimate to start from, not medical advice. About 2,700 calories keeps your weight where it is.');
    expect(targetNote(recommend(185, null), 185)).toContain('log your weight for a closer number');
  });
});

describe('targetsFor', () => {
  const rec = recommend(185, 170);
  it('uses the recommendation, with carbs and fat that follow it, when nothing is typed', () => {
    expect(targetsFor(undefined, rec)).toEqual({ kcal: 2800, protein: 150, fat: 80, carbs: 370, typed: { kcal: false, protein: false, carbs: false, fat: false } });
  });
  it('a typed number wins for its own key, and carbs and fat follow the calories in force', () => {
    expect(targetsFor({ kcal: 3000 }, rec)).toMatchObject({ kcal: 3000, protein: 150, fat: 85, carbs: 410, typed: { kcal: true, protein: false } });
    expect(targetsFor({ carbs: 300 }, rec)).toMatchObject({ kcal: 2800, carbs: 300, fat: 80, typed: { carbs: true } });
  });
  it('typed targets work with no recommendation, and with only some typed there is nothing to derive from', () => {
    expect(targetsFor({ kcal: 3000, protein: 180 }, { kind: 'none', reason: 'no-goal' })).toMatchObject({ kcal: 3000, protein: 180, fat: 85, carbs: 380 });
    expect(targetsFor({ kcal: 3000 }, { kind: 'none', reason: 'no-goal' })).toMatchObject({ kcal: 3000, protein: null, fat: null, carbs: null });
    expect(targetsFor(undefined, { kind: 'none', reason: 'no-goal' })).toMatchObject({ kcal: null, protein: null, fat: null, carbs: null });
  });
});
