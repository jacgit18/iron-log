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

describe('normConfig exercise note', () => {
  const run = (ex: object) => normConfig({ ex }).ex;
  it('keeps a good note and the rest of the entry', () => {
    expect(run({ hack: { eq: 'machine', step: 10, note: 'Pause at the bottom' } })).toEqual({ hack: { eq: 'machine', step: 10, note: 'Pause at the bottom' } });
    expect(run({ hack: { note: 'x'.repeat(200) } })).toEqual({ hack: { note: 'x'.repeat(200) } });
  });
  it('drops a note that is not text or is too long, and keeps everything else on that entry', () => {
    [5, null, {}, ['a'], 'x'.repeat(201)].forEach(note => expect(run({ hack: { eq: 'machine', step: 10, note }, bench: { note: 'ok' } })).toEqual({ hack: { eq: 'machine', step: 10 }, bench: { note: 'ok' } }));
  });
});

describe('normConfig exercise step', () => {
  const run = (ex: object) => normConfig({ ex }).ex;
  it('keeps a good step and the rest of the entry', () => {
    expect(run({ hack: { eq: 'machine', step: 10 } })).toEqual({ hack: { eq: 'machine', step: 10 } });
    expect(run({ hack: { n: 'Hack', step: 2.5 } })).toEqual({ hack: { n: 'Hack', step: 2.5 } });
  });
  it('drops a bad step and keeps everything else on that entry', () => {
    [0, -5, 51, 2.3, '10', null, NaN, {}].forEach(step => expect(run({ hack: { eq: 'machine', step } })).toEqual({ hack: { eq: 'machine' } }));
  });
  it('leaves entries without a step alone', () => {
    expect(run({ hack: { eq: 'machine' } })).toEqual({ hack: { eq: 'machine' } });
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

describe('normConfig hideKg', () => {
  it('keeps hideKg only when it is exactly true, and the config document keeps it', () => {
    expect(normConfig({ hideKg: true }).hideKg).toBe(true);
    ['yes', 1, false, null].forEach(v => expect('hideKg' in normConfig({ hideKg: v })).toBe(false));
    expect(normConfigDoc({ hideKg: true })?.hideKg).toBe(true);
  });
});

describe('profile (brief recommendations-by-age-sex)', () => {
  it('keeps a valid birth year and sex, and drops what is not usable', () => {
    expect(normConfig({ profile: { birthYear: 1985, sex: 'female', junk: 1 } }).profile).toEqual({ birthYear: 1985, sex: 'female' });
    expect(normConfig({ profile: { birthYear: 1985.5, sex: 'other' } }).profile).toBeUndefined();
    expect(normConfig({ profile: { birthYear: 1800 } }).profile).toBeUndefined();
    expect(normConfig({ profile: { birthYear: 3000, sex: 'male' } }).profile).toEqual({ sex: 'male' });
    expect(normConfig({ profile: 'x' }).profile).toBeUndefined();
  });
  it('is part of the stored config document', () => {
    expect(normConfigDoc({ profile: { birthYear: 1985, sex: 'male' } })).toEqual({ profile: { birthYear: 1985, sex: 'male' } });
  });
});
