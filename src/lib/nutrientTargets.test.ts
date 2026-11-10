import { describe, expect, it } from 'vitest';
import { LIMIT_KEYS, NUTRIENT_KEYS, TARGET_KEYS } from '../shared/nutrientKeys.js';
import { nutrientLabel, nutrientUnit } from './nutrientInfo.js';
import { limitOf } from './nutrientLimits.js';
import { NUTRIENT_TARGETS, targetOf } from './nutrientTargets.js';

// Brief nutrients-without-upper-limit: the second table is health information, so every row is sourced and sane, every nutrient key has a row in exactly one table, and nothing here is a limit.
describe('nutrient targets table', () => {
  it('has exactly one row for each nutrient without a limit', () => {
    expect(NUTRIENT_TARGETS.map(r => r.key).sort()).toEqual([...TARGET_KEYS].sort());
  });
  it('gives every nutrient key a row in exactly one table', () => {
    for (const k of NUTRIENT_KEYS) expect([limitOf(k), targetOf(k)].filter(Boolean), k).toHaveLength(1);
    expect(LIMIT_KEYS.some(k => (TARGET_KEYS as readonly string[]).includes(k))).toBe(false);
  });
  it.each(NUTRIENT_TARGETS.map(r => [r.key, r] as const))('%s is sourced and sane', (_k, r) => {
    expect(r.source).toMatch(/^(NIH Office of Dietary Supplements, https:\/\/ods\.od\.nih\.gov\/factsheets\/[A-Za-z0-9]+-HealthProfessional\/|National Academies of Sciences, Engineering, and Medicine .+ https:\/\/)/);
    expect(r.recommended.min).toBeGreaterThan(0);
    expect(r.recommended.max).toBeGreaterThanOrEqual(r.recommended.min);
    expect(r.cap).toBeGreaterThanOrEqual(20 * Math.max(r.recommended.max, r.stayUnder ?? 0));
    expect(['AI', 'RDA']).toContain(r.basis);
    expect(r.scopeNote.length).toBeGreaterThan(0);
    expect(r.recommendedNote.length).toBeGreaterThan(0);
  });
  it('says what none of them is: no row carries an upper limit, and only sodium has a level to stay under', () => {
    for (const r of NUTRIENT_TARGETS) expect('upper' in r, r.key).toBe(false);
    expect(NUTRIENT_TARGETS.filter(r => r.stayUnder !== undefined).map(r => r.key)).toEqual(['sodium']);
    expect(targetOf('sodium')!.scopeNote).toContain('not an upper limit');
  });
  it('holds the figures read from the sources on 2026-11-09', () => {
    const r = (k: string) => targetOf(k)!;
    expect(r('potassium').recommended).toEqual({ min: 2600, max: 3400 });
    expect(r('vitaminK').recommended).toEqual({ min: 90, max: 120 });
    expect(r('vitaminB12').recommended).toEqual({ min: 2.4, max: 2.4 });
    expect(r('fiber').recommended).toEqual({ min: 21, max: 38 });
    expect(r('sodium')).toMatchObject({ recommended: { min: 1500, max: 1500 }, stayUnder: 2300 });
  });
  it('holds the five figures read from the ODS fact sheets on 2026-11-10, none with a limit', () => {
    const r = (k: string) => targetOf(k)!;
    expect(r('thiamin')).toMatchObject({ unit: 'mg', recommended: { min: 1.1, max: 1.2 }, basis: 'RDA', cap: 1000 });
    expect(r('riboflavin')).toMatchObject({ unit: 'mg', recommended: { min: 1.1, max: 1.3 }, basis: 'RDA', cap: 1000 });
    expect(r('biotin')).toMatchObject({ unit: 'mcg', recommended: { min: 30, max: 30 }, basis: 'AI', cap: 20000 });
    expect(r('pantothenicAcid')).toMatchObject({ unit: 'mg', recommended: { min: 5, max: 5 }, basis: 'AI', cap: 2000 });
    expect(r('chromium')).toMatchObject({ unit: 'mcg', recommended: { min: 20, max: 35 }, basis: 'AI', cap: 2000 });
    for (const k of ['thiamin', 'riboflavin', 'biotin', 'pantothenicAcid', 'chromium']) expect(limitOf(k as never), k).toBeUndefined();
  });
});

describe('the shared lookup', () => {
  it('names and units a nutrient from whichever table holds it', () => {
    expect(nutrientLabel('zinc')).toBe('Zinc');
    expect(nutrientLabel('vitaminB12')).toBe('Vitamin B12');
    expect(nutrientUnit('fiber')).toBe('g');
    expect(nutrientUnit('calcium')).toBe('mg');
    expect(nutrientUnit('vitaminK')).toBe('mcg');
  });
});
