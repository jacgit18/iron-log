import { describe, expect, it } from 'vitest';
import { maxesSummary, modeSummary, phasesSummary } from './settingsScreens.js';

describe('Settings screen summaries', () => {
  it('names the program mode', () => {
    expect(modeSummary(1, 'Push/Pull')).toBe('Mode 1 · Push/Pull only');
    expect(modeSummary(2, 'Push/Pull')).toBe('Mode 2 · Alternate monthly');
    expect(modeSummary(3, 'Push/Pull')).toBe('Mode 3 · Swap every 6 months');
  });

  it('lists the first two phases, how many more, and the rest time', () => {
    expect(phasesSummary({})).toBe('Strength 85% · 4 × 6, Isometric 75% · 4 × 15–30 s +3 more · rest 90 s');
  });

  it('uses the person\'s own percentages, sets and rest', () => {
    expect(phasesSummary({ pct: { strength: 90 }, rxOverride: { iso: '3 × 20 s' }, rest: 120 })).toBe('Strength 90% · 4 × 6, Isometric 75% · 3 × 20 s +3 more · rest 120 s');
  });

  it('leaves out the percent of a phase that has none', () => {
    expect(phasesSummary({}, 5)).toContain('Mobility · 2 × 30 s · rest 90 s');
  });

  it('says how many 1RMs are set, or that none are', () => {
    expect(maxesSummary(0, 0)).toBe('No weighted exercises in your programs yet');
    expect(maxesSummary(12, 0)).toBe('None set yet · for reference only');
    expect(maxesSummary(12, 3)).toBe('3 of 12 set · for reference only');
  });
});
