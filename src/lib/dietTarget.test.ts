import { describe, expect, it } from 'vitest';
import { macrosFor, recommend, targetNote, targetsFor } from './dietTarget.js';

const bulk = (kcal: number, plan: object) => ({ kind: 'ok', direction: 'bulk', kcal, protein: 150, plan });

describe('recommend: calories from current weight and the goal', () => {
  it('bulk with no goal date: maintenance (15 per lb) plus 250 a day for 0.5 lb a week', () => {
    expect(recommend(185, 170)).toEqual(bulk(2800, { maintenance: 2550, surplus: 250, rate: 0.5, weeksToGoal: 30, capped: false }));
  });
  it('a goal date sets the pace: 15 lb in 20 weeks is 0.75 lb a week, 375 a day', () => {
    expect(recommend(185, 170, 20)).toEqual(bulk(2925, { maintenance: 2550, surplus: 375, rate: 0.75, weeksToGoal: 20, capped: false }));
  });
  it('a date that needs more than 1 lb a week is held at 1 lb (500 a day) and says so', () => {
    expect(recommend(185, 170, 5)).toEqual(bulk(3050, { maintenance: 2550, surplus: 500, rate: 1, weeksToGoal: 15, capped: true }));
  });
  it('a far-off date is held at 0.25 lb a week', () => {
    expect(recommend(185, 170, 100)).toEqual(bulk(2675, { maintenance: 2550, surplus: 125, rate: 0.25, weeksToGoal: 60, capped: false }));
  });
  it('a date in the past or today uses the default pace, and the plan says the date passed', () => {
    expect(recommend(185, 170, 0)).toMatchObject({ plan: { rate: 0.5, datePassed: true } });
    expect(recommend(185, 170, -3)).toMatchObject({ plan: { rate: 0.5, datePassed: true } });
    expect(recommend(185, 170)).toMatchObject({ plan: { rate: 0.5 } });
    expect(recommend(185, 170)).not.toMatchObject({ plan: { datePassed: true } });
  });
  it('the pace is a clean multiple of 0.05 (7 lb in 20 weeks is 0.35, not 0.35000000000000003)', () => {
    const r = recommend(177, 170, 20);
    expect(r).toMatchObject({ kind: 'ok', plan: { rate: 0.35, surplus: 175 } });
    for (const w of [4, 6, 7, 9, 11, 13, 17, 19, 23, 29]) expect(String((recommend(185, 170, w) as { plan: { rate: number } }).plan.rate)).toMatch(/^\d(\.\d{1,2})?$/);
  });
  it('protein is 0.8 g per lb of goal weight', () => {
    expect(recommend(200, 140)).toMatchObject({ protein: 160 });
  });
  it('maintain inside 2 lb either way: maintenance of the current weight, no surplus', () => {
    expect(recommend(180, 179)).toMatchObject({ direction: 'maintain', kcal: 2675, plan: { maintenance: 2675, surplus: 0, rate: 0 } });
    expect(recommend(180, 182)).toMatchObject({ direction: 'maintain', kcal: 2725 });
  });
  it('cut gives no recommendation', () => {
    expect(recommend(170, 185)).toEqual({ kind: 'none', reason: 'cut' });
  });
  it('no goal gives none', () => {
    expect(recommend(undefined, 170)).toEqual({ kind: 'none', reason: 'no-goal' });
    expect(recommend(0, 170)).toEqual({ kind: 'none', reason: 'no-goal' });
  });
  it('no weight logged: from the goal weight alone, no direction, no plan', () => {
    expect(recommend(185, null)).toEqual({ kind: 'ok', direction: null, kcal: 2775, protein: 150, plan: null });
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

describe('targetNote', () => {
  it('says why there is no recommendation', () => {
    expect(targetNote({ kind: 'none', reason: 'cut' }, 170)).toMatch(/Cutting/);
    expect(targetNote({ kind: 'none', reason: 'no-goal' }, null)).toMatch(/Set a goal weight/);
  });
  it('shows maintenance, the surplus, the pace and the weeks to the goal', () => {
    expect(targetNote(recommend(185, 170), 185)).toBe('An estimate to start from, not medical advice. About 2,550 to stay the same, plus 250 a day to gain about 0.5 lb a week; about 30 weeks to 185 lb.');
  });
  it('writes a clean pace and says when the goal date has passed', () => {
    expect(targetNote(recommend(177, 170, 20), 177)).toContain('gain about 0.35 lb a week');
    expect(targetNote(recommend(185, 170, -2), 185)).toContain('Your goal date has passed, so this uses the usual 0.5 lb a week.');
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
    expect(targetsFor({ kcal: 3000, protein: 180 }, { kind: 'none', reason: 'cut' })).toMatchObject({ kcal: 3000, protein: 180, fat: 85, carbs: 380 });
    expect(targetsFor({ kcal: 3000 }, { kind: 'none', reason: 'cut' })).toMatchObject({ kcal: 3000, protein: null, fat: null, carbs: null });
    expect(targetsFor(undefined, { kind: 'none', reason: 'no-goal' })).toMatchObject({ kcal: null, protein: null, fat: null, carbs: null });
  });
});
