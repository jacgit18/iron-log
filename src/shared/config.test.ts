import { describe, it, expect } from 'vitest';
import { normConfig, normConfigDoc } from './config.js';

describe('normConfig lift goals', () => {
  it('keeps the body weight a scaled goal was set at', () => {
    const g = { w: 300, start: 0, bw: 120, bwd: '2026-09-01' };
    expect(normConfig({ liftGoals: { hack: { any: g } } }).liftGoals).toEqual({ hack: { any: g } });
  });
  it('drops a bad body weight pair so the goal is a plain one', () => {
    const run = (g: object) => normConfig({ liftGoals: { hack: { any: g } } }).liftGoals!.hack!.any;
    expect(run({ w: 300, bw: 1e-6, bwd: '2000-01-01' })).toEqual({ w: 300 });
    expect(run({ w: 300, bw: 120, bwd: 'soon' })).toEqual({ w: 300 });
    expect(run({ w: 300, bw: 120 })).toEqual({ w: 300 });
  });
});

describe('recipeChips', () => {
  it('is cleaned, and dropped when nothing usable is left', () => {
    expect(normConfig({ recipeChips: { hide: ['drinks', 'soup'] } }).recipeChips).toEqual({ hide: ['drinks'] });
    expect('recipeChips' in normConfig({ recipeChips: { hide: ['soup'] } })).toBe(false);
    expect('recipeChips' in normConfig({ recipeChips: 5 })).toBe(false);
  });
  it('is kept in the config document the API stores', () => {
    expect(normConfigDoc({ recipeChips: { order: ['sides'] } })!.recipeChips).toEqual({ order: ['sides'] });
  });
});
