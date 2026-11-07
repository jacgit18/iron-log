import { describe, expect, it } from 'vitest';
import type { ProgramSlot } from '../types.ts';
import { itemFacts, programHeadline, rolePill, sectionNote, summarySentence, supersetRuns } from './programRowFacts';

const slot = (over: Partial<ProgramSlot> = {}): ProgramSlot => ({ id: 'x', items: [{ ex: 'sq', ph: 'strength', w: null }], ...over });

describe('itemFacts', () => {
  it('joins sets and reps with the load', () => expect(itemFacts({ ph: 'hyp', w: 45, rx: '3 × 10' })).toEqual({ facts: '3 × 10 · 45 lb', phase: 'Hypertrophy', phaseKey: 'hyp' }));
  it('says Bodyweight for a bodyweight card and leaves out what is missing', () => {
    expect(itemFacts({ ph: null, w: null, bw: true })).toEqual({ facts: 'Bodyweight', phase: null, phaseKey: null });
    expect(itemFacts({ ph: 'exp', w: null }).facts).toBe('');
    expect(itemFacts({ ph: 'exp', w: null, rx: '1 × 3' }).facts).toBe('1 × 3');
  });
  it('keeps a weight of 0 lb', () => expect(itemFacts({ ph: null, w: 0 }).facts).toBe('0 lb'));
});

describe('rolePill', () => {
  it('names Primary a main lift, keeps other tiers as typed, and marks the Optional section', () => {
    expect(rolePill({ tier: 'Primary', sec: 'Regular' })).toBe('Main lift');
    expect(rolePill({ tier: 'Accessory', sec: 'Regular' })).toBe('Accessory');
    expect(rolePill({ tier: 'T2' })).toBe('T2');
    expect(rolePill({ sec: 'Optional' })).toBe('Optional');
    expect(rolePill({ sec: 'Home' })).toBe('');
  });
});

describe('sectionNote', () => {
  it('explains only the names the app uses, whatever the case', () => {
    expect(sectionNote('Regular')).toBe('The core of the day');
    expect(sectionNote(' supersets ')).toBe('Two exercises done back to back');
    expect(sectionNote('Optional')).not.toBe('');
  });
  it('shows a name the person typed as it is, with no explanation', () => {
    expect(sectionNote('Leg day finisher')).toBe('');
    expect(sectionNote(undefined)).toBe('');
  });
});

describe('supersetRuns', () => {
  it('boxes consecutive superset cards together and separates runs', () => {
    const t = (...ts: (string | undefined)[]) => ts.map(type => ({ type })) as { type: ProgramSlot['type'] }[];
    expect(supersetRuns(t('single', 'superset', 'superset', 'single', 'superset'))).toEqual([[1, 2], [4, 4]]);
    expect(supersetRuns(t('single', 'either'))).toEqual([]);
    expect(supersetRuns([])).toEqual([]);
  });
});

describe('summarySentence', () => {
  const m = (...names: string[]) => names.map(name => ({ key: 'chest' as const, name, sets: 1 }));
  it('leads with the main phase and the top three muscles', () => {
    expect(summarySentence({ exercises: 12, phases: [{ key: 'strength', count: 5 }, { key: 'hyp', count: 3 }], muscles: m('Forearms & grip', 'Inner thigh', 'Chest', 'Lats') }))
      .toBe('Mostly strength. Works forearms & grip, inner thigh and chest.');
  });
  it('says a mix when no phase has half the day', () => {
    expect(summarySentence({ exercises: 4, phases: [{ key: 'strength', count: 1 }, { key: 'hyp', count: 1 }, { key: 'iso', count: 1 }], muscles: [] })).toBe('A mix of strength, hypertrophy and isometric.');
  });
  it('copes with no phases, one muscle, and an empty day', () => {
    expect(summarySentence({ exercises: 1, phases: [], muscles: m('Chest') })).toBe('Works chest.');
    expect(summarySentence({ exercises: 0, phases: [], muscles: [] })).toBe('No exercises on this day yet.');
  });
});

describe('programHeadline', () => {
  it('counts a superset as its exercises, as the Day picker does', () => {
    const days = [{ slots: [slot(), slot({ type: 'superset', items: [{ ex: 'a', ph: null, w: null }, { ex: 'b', ph: null, w: null }] })] }, { slots: [] }];
    expect(programHeadline(days)).toBe('3 exercises across 2 days');
    expect(programHeadline([{ slots: [slot()] }, { slots: [] }])).toBe('1 exercise across 2 days');
  });
});
