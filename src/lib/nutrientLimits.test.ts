import { describe, expect, it } from 'vitest';
import { LIMIT_KEYS } from '../shared/nutrientKeys.js';
import { NUTRIENT_LIMITS, limitOf } from './nutrientLimits.js';

describe('nutrient limits table', () => {
  it('has exactly one row for each nutrient that has a limit', () => {
    expect(NUTRIENT_LIMITS.map(r => r.key).sort()).toEqual([...LIMIT_KEYS].sort());
  });
  it.each(NUTRIENT_LIMITS.map(r => [r.key, r] as const))('%s is sourced and sane', (_k, r) => {
    expect(r.sourceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.source).toMatch(/^NIH Office of Dietary Supplements, https:\/\/ods\.od\.nih\.gov\/factsheets\/[A-Za-z0-9]+-HealthProfessional\//);
    expect(r.upper).toBeGreaterThan(0);
    expect(Number.isFinite(r.upper)).toBe(true);
    expect(r.recommended.min).toBeGreaterThan(0);
    expect(r.recommended.max).toBeGreaterThanOrEqual(r.recommended.min);
    // a supplements-only limit (magnesium: 350 mg) is below the total RDA (up to 420 mg) by design
    if (r.scope !== 'supplements') expect(r.upper).toBeGreaterThan(r.recommended.max);
    expect(['mg', 'mcg']).toContain(r.unit);
    expect(r.label).not.toBe('');
    expect(r.scopeNote).not.toBe('');
  });
  it('looks a row up by key', () => {
    expect(limitOf('magnesium')?.scope).toBe('supplements');
    expect(limitOf('vitaminD')?.upper).toBe(100);
  });
});
