import { describe, expect, it } from 'vitest';
import { recommend, targetNote, targetsFor } from './dietTarget.js';

describe('recommend', () => {
  it('bulk: 15 per lb of goal weight and 0.8 g protein per lb of goal weight', () => {
    expect(recommend(185, 170)).toEqual({ kind: 'ok', direction: 'bulk', kcal: 2775, protein: 150 });
  });
  it('caps a bulk at 500 over what the current weight needs', () => {
    expect(recommend(200, 140)).toEqual({ kind: 'ok', direction: 'bulk', kcal: 2600, protein: 160 });
  });
  it('maintain inside 2 lb either way', () => {
    expect(recommend(180, 179)).toMatchObject({ direction: 'maintain', kcal: 2700 });
    expect(recommend(180, 182)).toMatchObject({ direction: 'maintain', kcal: 2700 });
  });
  it('cut gives no recommendation', () => {
    expect(recommend(170, 185)).toEqual({ kind: 'none', reason: 'cut' });
  });
  it('no goal gives none', () => {
    expect(recommend(undefined, 170)).toEqual({ kind: 'none', reason: 'no-goal' });
    expect(recommend(0, 170)).toEqual({ kind: 'none', reason: 'no-goal' });
  });
  it('no weight logged: from the goal alone, no direction, no cap', () => {
    expect(recommend(185, null)).toEqual({ kind: 'ok', direction: null, kcal: 2775, protein: 150 });
  });
});

describe('targetNote', () => {
  it('says why there is no recommendation', () => {
    expect(targetNote({ kind: 'none', reason: 'cut' }, 170)).toMatch(/Cutting/);
    expect(targetNote({ kind: 'none', reason: 'no-goal' }, null)).toMatch(/Set a goal weight/);
  });
  it('labels the estimate and names the goal and direction', () => {
    expect(targetNote(recommend(185, 170), 185)).toBe('An estimate to start from, not medical advice. Based on your goal of 185 lb (gaining).');
    expect(targetNote(recommend(180, 180), 180)).toContain('(maintaining)');
    expect(targetNote(recommend(185, null), 185)).toBe('An estimate to start from, not medical advice. Based on your goal of 185 lb.');
  });
});

describe('targetsFor', () => {
  const rec = recommend(185, 170);
  it('uses the recommendation when nothing is typed', () => {
    expect(targetsFor(undefined, rec)).toEqual({ kcal: 2775, protein: 150, kcalTyped: false, proteinTyped: false });
  });
  it('a typed number wins and only for its own key', () => {
    expect(targetsFor({ kcal: 3000 }, rec)).toEqual({ kcal: 3000, protein: 150, kcalTyped: true, proteinTyped: false });
  });
  it('typed targets work with no recommendation', () => {
    expect(targetsFor({ kcal: 3000, protein: 180 }, { kind: 'none', reason: 'cut' })).toMatchObject({ kcal: 3000, protein: 180 });
    expect(targetsFor(undefined, { kind: 'none', reason: 'no-goal' })).toMatchObject({ kcal: null, protein: null });
  });
});
