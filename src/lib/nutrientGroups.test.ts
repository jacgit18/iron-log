import { describe, expect, it } from 'vitest';
import { NUTRIENT_KEYS } from '../shared/nutrientKeys.js';
import { NUTRIENT_GROUPS, groupFor, recommendedFor, upperFor } from './nutrientGroups.js';
import { limitOf } from './nutrientLimits.js';
import { targetOf } from './nutrientTargets.js';

// Brief recommendations-by-age-sex, PR 1: the per-group table is health information, so every row is sourced, complete and consistent with the adult range the sheet falls back to.
const f = (birthYear: number, sex: 'female' | 'male' = 'female') => ({ birthYear, sex });

describe('the table', () => {
  it('has exactly one row for each of the 20 nutrients', () => {
    expect(NUTRIENT_GROUPS.map(r => r.key).sort()).toEqual([...NUTRIENT_KEYS].sort());
  });
  it.each(NUTRIENT_GROUPS.map(r => [r.key, r] as const))('%s is sourced, gap-free and positive', (_k, r) => {
    expect(r.source).toMatch(/^(NIH Office of Dietary Supplements, https:\/\/ods\.od\.nih\.gov\/factsheets\/[A-Za-z0-9]+-HealthProfessional\/ \(Tables? [\d and]+\)|National Academies of Sciences, Engineering, and Medicine .+ https:\/\/)/);
    expect(r.bands[0]!.from).toBe(19);
    r.bands.forEach((b, i) => {
      if (i > 0) expect(b.from, 'no gap or overlap').toBe(r.bands[i - 1]!.to! + 1);
      expect(b.female).toBeGreaterThan(0);
      expect(b.male).toBeGreaterThan(0);
      if (b.ul !== undefined) expect(b.ul).toBeGreaterThan(0);
    });
    expect(r.bands.at(-1)!.to, 'the last band has no upper age').toBeUndefined();
    r.bands.slice(0, -1).forEach(b => expect(b.to).toBeGreaterThanOrEqual(b.from));
  });
  it('agrees with the adult range and limit the sheet falls back to', () => {
    for (const r of NUTRIENT_GROUPS) {
      const all = r.bands.flatMap(b => [b.female, b.male]);
      const range = limitOf(r.key)?.recommended ?? targetOf(r.key)!.recommended;
      expect(Math.min(...all), `${r.key} lowest`).toBe(range.min);
      expect(Math.max(...all), `${r.key} highest`).toBe(range.max);
      const uls = r.bands.map(b => b.ul).filter((u): u is number => u !== undefined);
      const limit = limitOf(r.key);
      if (limit) expect(Math.min(...uls), `${r.key} strictest limit`).toBe(limit.upper);
      else expect(uls, `${r.key} has no limit`).toEqual([]);
    }
  });
});

describe('groupFor', () => {
  const today = '2026-11-09';
  it('picks the person\'s band and names it', () => {
    expect(groupFor('magnesium', f(1990), today)).toEqual({ recommended: 320, upper: 350, group: 'women ages 31 and over', basis: 'RDA' });
    expect(groupFor('magnesium', f(1990, 'male'), today)).toMatchObject({ recommended: 420, group: 'men ages 31 and over' });
    expect(groupFor('magnesium', f(2000, 'male'), today)).toMatchObject({ recommended: 400, group: 'men ages 19 to 30' });
    expect(groupFor('fiber', f(1960), today)).toMatchObject({ recommended: 21, group: 'women ages 51 and over', basis: 'AI' });
  });
  it('judges calcium and phosphorus against the person\'s own limit', () => {
    expect(upperFor('calcium', f(1986), today)).toBe(2500);
    expect(upperFor('calcium', f(1974), today)).toBe(2000);
    expect(upperFor('phosphorus', f(1960), today)).toBe(4000);
    expect(upperFor('phosphorus', f(1955), today)).toBe(3000);
    expect(upperFor('potassium', f(1990), today)).toBeUndefined();
    expect(recommendedFor('potassium', f(1990, 'male'), today)).toBe(3400);
  });
  it('changes band at every edge, by the year of the local date', () => {
    // age = year of today minus the birth year: 50 is in 19 to 50, 51 in 51 and over, 70 and 71 split calcium's women's 51 to 70 and vitamin D.
    expect(recommendedFor('iron', f(1976), '2026-01-01')).toBe(18);
    expect(recommendedFor('iron', f(1975), '2026-01-01')).toBe(8);
    expect(recommendedFor('iron', f(1975), '2025-12-31')).toBe(18);
    expect(recommendedFor('vitaminD', f(1956), '2026-06-01')).toBe(15);
    expect(recommendedFor('vitaminD', f(1955), '2026-06-01')).toBe(20);
    expect(recommendedFor('calcium', f(1957), '2026-06-01')).toBe(1200);
    expect(recommendedFor('calcium', f(1957, 'male'), '2026-06-01')).toBe(1000);
    expect(recommendedFor('calcium', f(1955, 'male'), '2026-06-01')).toBe(1200);
  });
  it('shows nothing it cannot back: no profile, one field, under 19, over 120, a future year', () => {
    for (const p of [undefined, {}, { sex: 'female' as const }, { birthYear: 1990 }, f(2008), f(2007) /* 19 passes */, f(1900), f(2030)]) {
      const g = groupFor('zinc', p, today);
      if (p && 'birthYear' in p && p.birthYear === 2007) expect(g).toMatchObject({ recommended: 8 });
      else expect(g, JSON.stringify(p)).toBeUndefined();
    }
  });
});
