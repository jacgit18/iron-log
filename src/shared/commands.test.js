import { describe, it, expect } from 'vitest';
import { BUILTIN } from '../lib/data.js';
import { validateLogSession, validateTickCard, validateUntickCard, validateDeleteEntry, validateLogBodyWeight, validateDeleteBodyWeight, validateSaveWeek, validateSaveStretchWeek, validateDeleteWeek, validateSaveSupplementDay, validateDeleteSupplementDay, validateSaveProgram, validateDeleteProgram, validateSaveConfig, validateSaveLibraryItem, validateDeleteLibraryItem, validateSaveListItem, validateDeleteListItem } from './commands.js';

describe('validateLogSession', () => {
  it('accepts an exercise id with a valid entry and cleans the entry', () => {
    const out = validateLogSession({ exerciseId: 'squat', entry: { d: '2026-10-07', w: '135', s: 3, junk: 1 } });
    expect(out).toEqual({ exerciseId: 'squat', entry: { d: '2026-10-07', w: 135, s: 3 } });
  });
  it('refuses a missing or oversized exercise id', () => {
    expect(validateLogSession({ entry: { d: '2026-10-07' } })).toBeNull();
    expect(validateLogSession({ exerciseId: 'x'.repeat(101), entry: { d: '2026-10-07' } })).toBeNull();
  });
  it('refuses an entry with no valid date, and non-objects', () => {
    expect(validateLogSession({ exerciseId: 'squat', entry: { d: 'nope' } })).toBeNull();
    expect(validateLogSession(null)).toBeNull();
  });
});

describe('validateTickCard', () => {
  const tick = { d: '2026-10-07', w: 135, s: 3, r: 5, slot: 'A-d1s1', wk: '2026-10-04', auto: true };
  it('accepts a check-off with a slot and a week', () => {
    expect(validateTickCard({ exerciseId: 'squat', entry: tick })).toEqual({ exerciseId: 'squat', entry: tick });
  });
  it('refuses an entry that is not marked auto, or has no slot or week', () => {
    expect(validateTickCard({ exerciseId: 'squat', entry: { ...tick, auto: false } })).toBeNull();
    expect(validateTickCard({ exerciseId: 'squat', entry: { ...tick, slot: undefined } })).toBeNull();
    expect(validateTickCard({ exerciseId: 'squat', entry: { ...tick, wk: undefined } })).toBeNull();
  });
});

describe('validateUntickCard', () => {
  it('accepts a card and week, with optional exercise and removeLogged', () => {
    expect(validateUntickCard({ slot: 's1', wk: '2026-10-04' })).toEqual({ slot: 's1', wk: '2026-10-04' });
    expect(validateUntickCard({ slot: 's1', wk: '2026-10-04', exerciseId: 'squat', removeLogged: true, junk: 1 })).toEqual({ slot: 's1', wk: '2026-10-04', exerciseId: 'squat', removeLogged: true });
  });
  it('refuses a missing slot, a bad week, and wrong types', () => {
    expect(validateUntickCard({ wk: '2026-10-04' })).toBeNull();
    expect(validateUntickCard({ slot: 's1', wk: 'nope' })).toBeNull();
    expect(validateUntickCard({ slot: 's1', wk: '2026-10-04', exerciseId: '' })).toBeNull();
    expect(validateUntickCard({ slot: 's1', wk: '2026-10-04', removeLogged: 'yes' })).toBeNull();
    expect(validateUntickCard(null)).toBeNull();
  });
});

describe('validateDeleteEntry', () => {
  it('accepts an entry id and drops other fields', () => {
    expect(validateDeleteEntry({ entryId: 'L1', junk: 1 })).toEqual({ entryId: 'L1' });
  });
  it('refuses a missing, empty, oversized or non-string id, and non-objects', () => {
    expect(validateDeleteEntry({})).toBeNull();
    expect(validateDeleteEntry({ entryId: '' })).toBeNull();
    expect(validateDeleteEntry({ entryId: 'x'.repeat(101) })).toBeNull();
    expect(validateDeleteEntry({ entryId: 5 })).toBeNull();
    expect(validateDeleteEntry(null)).toBeNull();
  });
});

describe('validateLogBodyWeight', () => {
  it('accepts a week, a day and a weight, and cleans the entry', () => {
    expect(validateLogBodyWeight({ wk: '2026-10-04', d: '2026-10-07', w: '180.5', junk: 1, updatedAt: '2026-10-07T12:00:00Z' })).toEqual({ wk: '2026-10-04', d: '2026-10-07', w: 180.5 });
  });
  it('refuses a bad date, a missing or out-of-range weight, and non-objects', () => {
    expect(validateLogBodyWeight({ wk: 'nope', d: '2026-10-07', w: 180 })).toBeNull();
    expect(validateLogBodyWeight({ wk: '2026-10-04', d: 'nope', w: 180 })).toBeNull();
    expect(validateLogBodyWeight({ wk: '2026-10-04', d: '2026-10-07' })).toBeNull();
    expect(validateLogBodyWeight({ wk: '2026-10-04', d: '2026-10-07', w: 0 })).toBeNull();
    expect(validateLogBodyWeight({ wk: '2026-10-04', d: '2026-10-07', w: 1500 })).toBeNull();
    expect(validateLogBodyWeight(null)).toBeNull();
  });
});

describe('validateDeleteBodyWeight', () => {
  it('accepts a week and drops other fields', () => {
    expect(validateDeleteBodyWeight({ wk: '2026-10-04', junk: 1 })).toEqual({ wk: '2026-10-04' });
  });
  it('refuses a missing or bad week, and non-objects', () => {
    expect(validateDeleteBodyWeight({})).toBeNull();
    expect(validateDeleteBodyWeight({ wk: '2026-13-40' })).toBeNull();
    expect(validateDeleteBodyWeight(null)).toBeNull();
  });
});

describe('validateSaveWeek', () => {
  it('accepts a week start and cleans the week', () => {
    const out = validateSaveWeek({ weekStart: '2026-10-04', week: { prog: 'A', done: { 'A-d1s1:0': true, bad: 0 }, junk: 1 } });
    expect(out.weekStart).toBe('2026-10-04');
    expect(out.week).toMatchObject({ prog: 'A', done: { 'A-d1s1:0': true }, skipped: {}, moved: {}, ph: {}, warm: {} });
    expect(out.week.junk).toBeUndefined();
  });
  it('refuses a bad week start, a missing week and non-objects', () => {
    expect(validateSaveWeek({ weekStart: 'nope', week: {} })).toBeNull();
    expect(validateSaveWeek({ weekStart: '2026-10-04' })).toBeNull();
    expect(validateSaveWeek({ weekStart: '2026-10-04', week: 'x' })).toBeNull();
    expect(validateSaveWeek(null)).toBeNull();
  });
});

describe('validateSaveStretchWeek', () => {
  it('accepts a week start and cleans the stretch week', () => {
    const out = validateSaveStretchWeek({ weekStart: '2026-10-04', week: { done: { '0:scarecrow': true, 'x:bad': true }, skipped: { 2: true }, junk: 1 } });
    expect(out).toEqual({ weekStart: '2026-10-04', week: { done: { '0:scarecrow': true }, skipped: { 2: true }, extra: [] } });
  });
  it('refuses a bad week start or a missing week', () => {
    expect(validateSaveStretchWeek({ weekStart: '2026-13-01', week: {} })).toBeNull();
    expect(validateSaveStretchWeek({ weekStart: '2026-10-04' })).toBeNull();
  });
});

describe('validateDeleteWeek', () => {
  it('accepts a week start and drops other fields', () => {
    expect(validateDeleteWeek({ weekStart: '2026-10-04', junk: 1 })).toEqual({ weekStart: '2026-10-04' });
  });
  it('refuses a missing or bad week start', () => {
    expect(validateDeleteWeek({})).toBeNull();
    expect(validateDeleteWeek({ weekStart: 'nope' })).toBeNull();
    expect(validateDeleteWeek(null)).toBeNull();
  });
});

describe('validateSaveSupplementDay', () => {
  it('accepts a day and cleans the water, boost and taken', () => {
    const out = validateSaveSupplementDay({ day: '2026-10-07', water: [16, '8.04', 0, 300, 'x'], boost: { hot: true, mins: 45.4, junk: 1 }, taken: { creatine: true, zinc: false }, junk: 1 });
    expect(out).toEqual({ day: '2026-10-07', water: [16, 8], boost: { hot: true, mins: 45 }, taken: { creatine: true } });
  });
  it('fills in empty values for what is missing', () => {
    expect(validateSaveSupplementDay({ day: '2026-10-07' })).toEqual({ day: '2026-10-07', water: [], boost: null, taken: {} });
  });
  it('refuses a bad day and non-objects', () => {
    expect(validateSaveSupplementDay({ day: 'nope' })).toBeNull();
    expect(validateSaveSupplementDay({})).toBeNull();
    expect(validateSaveSupplementDay(null)).toBeNull();
  });
});

describe('validateDeleteSupplementDay', () => {
  it('accepts a day and refuses a missing or bad one', () => {
    expect(validateDeleteSupplementDay({ day: '2026-10-07', junk: 1 })).toEqual({ day: '2026-10-07' });
    expect(validateDeleteSupplementDay({})).toBeNull();
    expect(validateDeleteSupplementDay({ day: '2026-02-30' })).toBeNull();
    expect(validateDeleteSupplementDay(null)).toBeNull();
  });
});

describe('validateSaveProgram', () => {
  it('accepts program A or B and returns the body without the key', () => {
    const out = validateSaveProgram({ key: 'A', program: structuredClone(BUILTIN.A) });
    expect(out.key).toBe('A');
    expect(out.program.key).toBeUndefined();
    expect(out.program.days).toHaveLength(7);
  });
  it('pads a six-day program to seven days', () => {
    const six = structuredClone(BUILTIN.A);
    six.days = six.days.slice(0, 6);
    expect(validateSaveProgram({ key: 'B', program: six }).program.days).toHaveLength(7);
  });
  it('refuses another key, a missing program and a program with the wrong shape', () => {
    expect(validateSaveProgram({ key: 'C', program: BUILTIN.A })).toBeNull();
    expect(validateSaveProgram({ key: 'A' })).toBeNull();
    expect(validateSaveProgram({ key: 'A', program: { days: 'x' } })).toBeNull();
    expect(validateSaveProgram(null)).toBeNull();
  });
});

describe('validateDeleteProgram', () => {
  it('accepts A or B and refuses anything else', () => {
    expect(validateDeleteProgram({ key: 'B', junk: 1 })).toEqual({ key: 'B' });
    expect(validateDeleteProgram({ key: 'C' })).toBeNull();
    expect(validateDeleteProgram({})).toBeNull();
    expect(validateDeleteProgram(null)).toBeNull();
  });
});

describe('validateSaveConfig', () => {
  it('keeps the settings that belong on the server and cleans them', () => {
    const out = validateSaveConfig({ config: { mode: 2, m2Even: 'B', pct: { hyp: 70, bad: 500 }, rm: { bench: 225, squat: -5 }, waterGoal: 72.04, waterMode: 'fixed', rest: 90 } });
    expect(out.config).toMatchObject({ mode: 2, m2Even: 'B', rm: { bench: 225 }, waterGoal: 72, waterMode: 'fixed', rest: 90 });
    expect(out.config.pct.hyp).toBe(70);
    expect(out.config.pct.bad).toBeUndefined();
  });
  it('drops the GitHub backup settings, a token and unknown keys', () => {
    const out = validateSaveConfig({ config: { mode: 1, backup: { repo: 'me/data', branch: 'main', hashes: {} }, ghBackup: { repo: 'me/x', token: 'secret' }, token: 'secret', junk: 1 } });
    expect(out.config).toEqual({ mode: 1 });
  });
  it('drops values that are out of range or the wrong type', () => {
    const out = validateSaveConfig({ config: { mode: 9, m3Start: 13, m3First: 'C', rest: 9999, waterGoal: 5, waterMode: 'x', warmup: 'nope' } });
    expect(out.config).toEqual({});
  });
  it('cleans the warm-up list', () => {
    const out = validateSaveConfig({ config: { warmup: [{ id: 'w1', n: ' Bike ', rx: '5 min' }, { id: 'w1', n: 'dup', rx: '' }, { id: 'w2', n: '', rx: '' }, 'x'] } });
    expect(out.config.warmup).toEqual([{ id: 'w1', n: 'Bike', rx: '5 min' }]);
  });
  it('accepts an empty config and refuses a missing or non-object one', () => {
    expect(validateSaveConfig({ config: {} })).toEqual({ config: {} });
    expect(validateSaveConfig({})).toBeNull();
    expect(validateSaveConfig({ config: [] })).toBeNull();
    expect(validateSaveConfig(null)).toBeNull();
  });
});

describe('validateSaveLibraryItem', () => {
  const item = { id: 'v1', name: 'My cut', from: 'A', at: '2026-10-07T12:00:00Z', prog: structuredClone(BUILTIN.A) };
  it('accepts a saved version and cleans it, with the program padded to seven days', () => {
    const out = validateSaveLibraryItem({ item: { ...item, junk: 1, auto: true } });
    expect(out.item).toMatchObject({ id: 'v1', name: 'My cut', from: 'A', at: '2026-10-07T12:00:00Z', auto: true });
    expect(out.item.junk).toBeUndefined();
    expect(out.item.prog.days).toHaveLength(7);
  });
  it('gives a nameless version the default name', () => {
    expect(validateSaveLibraryItem({ item: { ...item, name: '' } }).item.name).toBe('Saved version');
  });
  it('refuses a missing item, a bad id and a program with the wrong shape', () => {
    expect(validateSaveLibraryItem({})).toBeNull();
    expect(validateSaveLibraryItem({ item: { ...item, id: '' } })).toBeNull();
    expect(validateSaveLibraryItem({ item: { ...item, id: 'a b' } })).toBeNull();
    expect(validateSaveLibraryItem({ item: { ...item, prog: { days: 'x' } } })).toBeNull();
    expect(validateSaveLibraryItem(null)).toBeNull();
  });
});

describe('validateDeleteLibraryItem', () => {
  it('accepts an id and refuses a missing, empty or oversized one', () => {
    expect(validateDeleteLibraryItem({ id: 'v1', junk: 1 })).toEqual({ id: 'v1' });
    expect(validateDeleteLibraryItem({})).toBeNull();
    expect(validateDeleteLibraryItem({ id: '' })).toBeNull();
    expect(validateDeleteLibraryItem({ id: 'x'.repeat(101) })).toBeNull();
    expect(validateDeleteLibraryItem(null)).toBeNull();
  });
});

describe('validateSaveListItem', () => {
  it('cleans a stretch', () => {
    const out = validateSaveListItem({ list: 'stretch', position: 2, item: { id: 'scarecrow', n: ' Scarecrow ', tier: 'primary', url: 'https://youtu.be/x', junk: 1 } });
    expect(out).toEqual({ list: 'stretch', position: 2, item: { id: 'scarecrow', n: 'Scarecrow', group: 'Other', tier: 'primary', url: 'https://youtu.be/x' } });
  });
  it('drops a stretch url that is not http(s)', () => {
    expect(validateSaveListItem({ list: 'stretch', position: 0, item: { id: 's1', n: 'Reach', url: 'javascript:alert(1)' } }).item.url).toBeUndefined();
  });
  it('cleans a stretch experiment, an experiment and a supplement', () => {
    expect(validateSaveListItem({ list: 'stretch_experiment', position: 0, item: { id: 'e1', n: 'Pigeon', note: 'try it', junk: 1 } }).item).toEqual({ id: 'e1', n: 'Pigeon', note: 'try it' });
    expect(validateSaveListItem({ list: 'experiment', position: 1, item: { id: 'x1', ex: 'squat', ph: 'hyp', note: 'n' } }).item).toEqual({ id: 'x1', ex: 'squat', ph: 'hyp', note: 'n' });
    expect(validateSaveListItem({ list: 'supplement_item', position: 0, item: { id: 'creatine', n: 'Creatine', slot: 'morning', dose: '5 g' } }).item).toEqual({ id: 'creatine', n: 'Creatine', slot: 'morning', dose: '5 g' });
    expect(validateSaveListItem({ list: 'supplement_item', position: 0, item: { id: 'zinc', n: 'Zinc', slot: 'weekly' } }).item.slot).toBe('');
  });
  it('refuses another list, a bad position, a missing or unusable item, and an id over 100 characters', () => {
    expect(validateSaveListItem({ list: 'other', position: 0, item: { id: 'a', n: 'A' } })).toBeNull();
    expect(validateSaveListItem({ list: 'stretch', position: -1, item: { id: 'a', n: 'A' } })).toBeNull();
    expect(validateSaveListItem({ list: 'stretch', position: 1.5, item: { id: 'a', n: 'A' } })).toBeNull();
    expect(validateSaveListItem({ list: 'stretch', position: 10000, item: { id: 'a', n: 'A' } })).toBeNull();
    expect(validateSaveListItem({ list: 'stretch', item: { id: 'a', n: 'A' } })).toBeNull();
    expect(validateSaveListItem({ list: 'stretch', position: 0 })).toBeNull();
    expect(validateSaveListItem({ list: 'stretch', position: 0, item: { id: 'a' } })).toBeNull();
    expect(validateSaveListItem({ list: 'experiment', position: 0, item: { id: 'x'.repeat(101), ex: 'squat' } })).toBeNull();
    expect(validateSaveListItem(null)).toBeNull();
  });
});

describe('validateDeleteListItem', () => {
  it('accepts a list and an id, and refuses anything else', () => {
    expect(validateDeleteListItem({ list: 'experiment', id: 'x1', junk: 1 })).toEqual({ list: 'experiment', id: 'x1' });
    expect(validateDeleteListItem({ list: 'nope', id: 'x1' })).toBeNull();
    expect(validateDeleteListItem({ list: 'experiment' })).toBeNull();
    expect(validateDeleteListItem({ list: 'experiment', id: '' })).toBeNull();
    expect(validateDeleteListItem({ list: 'experiment', id: 'x'.repeat(101) })).toBeNull();
    expect(validateDeleteListItem(null)).toBeNull();
  });
});
