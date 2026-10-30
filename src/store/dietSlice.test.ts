import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';
import { MAX_DIET_PER_DAY } from '../shared/diet.js';

// Your food log and typed targets (ADR 086): added, fixed, removed with Undo, capped per day, and carried through the data file.
let useAppStore: typeof import('./useAppStore.js').useAppStore;
const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(() => { clearStorage(); useAppStore.setState({ diet: [], removed: null }); st().mutateCfg(c => { delete c.diet; }); });

const day = '2026-10-29';
const rice = { d: day, n: 'Rice', kcal: 200, p: 4 };

describe('addDietEntry', () => {
  it('adds an entry with an id and keeps the numbers', () => {
    const r = st().addDietEntry(rice);
    expect(r.error).toBeNull();
    expect(st().diet).toEqual([{ id: r.id, ...rice }]);
  });
  it('refuses bad numbers or a blank name and changes nothing', () => {
    expect(st().addDietEntry({ ...rice, kcal: 0 }).error).toMatch(/calories/);
    expect(st().addDietEntry({ ...rice, n: ' ' }).error).toMatch(/name/);
    expect(st().addDietEntry({ ...rice, p: NaN }).error).toBeTruthy();
    expect(st().diet).toEqual([]);
  });
  it('refuses a day too far back to keep, saying so', () => {
    const r = st().addDietEntry({ ...rice, d: '2020-01-01' });
    expect(r.id).toBeNull(); expect(r.error).toMatch(/400 days/);
    expect(st().diet).toEqual([]);
  });
  it('refuses the 21st entry of a day but not of another day', () => {
    for (let i = 0; i < MAX_DIET_PER_DAY; i++) expect(st().addDietEntry(rice).error).toBeNull();
    expect(st().addDietEntry(rice).error).toBe('You can log 20 things a day.');
    expect(st().addDietEntry({ ...rice, d: '2026-10-28' }).error).toBeNull();
  });
});

describe('carbs and fat', () => {
  it('adds an entry with carbs and fat, and one without', () => {
    st().addDietEntry({ ...rice, c: 44, f: 0.5 }); st().addDietEntry({ ...rice, n: 'Toast' });
    expect(st().diet[0]).toMatchObject({ c: 44, f: 0.5 });
    expect(st().diet[1]).not.toHaveProperty('c');
  });
  it('an edit can set and clear them', () => {
    const id = st().addDietEntry(rice).id!;
    expect(st().updateDietEntry(id, { c: 30, f: 5 })).toBeNull();
    expect(st().diet[0]).toMatchObject({ c: 30, f: 5 });
    expect(st().updateDietEntry(id, { c: null })).toBeNull();
    expect(st().diet[0]).not.toHaveProperty('c');
    expect(st().diet[0]).toMatchObject({ f: 5 });
  });
  it('typed targets can include carbs and fat, and clear one at a time', () => {
    expect(st().setDietTarget('carbs', 400)).toBeNull(); expect(st().setDietTarget('fat', 80)).toBeNull();
    expect(st().cfg.diet).toEqual({ carbs: 400, fat: 80 });
    expect(st().setDietTarget('fat', 5)).toMatch(/Fat/);
    st().setDietTarget('carbs', null);
    expect(st().cfg.diet).toEqual({ fat: 80 });
  });
});

describe('updateDietEntry and removeDietEntry', () => {
  it('fixes the numbers and keeps the day and the recipe link', () => {
    const id = st().addDietEntry({ ...rice, from: 'chili-1' }).id!;
    expect(st().updateDietEntry(id, { kcal: 250, p: 5 })).toBeNull();
    expect(st().diet[0]).toMatchObject({ id, d: day, kcal: 250, p: 5, from: 'chili-1' });
    expect(st().updateDietEntry(id, { kcal: 99999 })).toMatch(/calories/);
    expect(st().diet[0]!.kcal).toBe(250);
  });
  it('removes with an Undo that puts the entry back in place', () => {
    const a = st().addDietEntry(rice).id!; const b = st().addDietEntry({ ...rice, n: 'Toast' }).id!;
    st().removeDietEntry(a);
    expect(st().diet.map(e => e.id)).toEqual([b]);
    expect(st().removed?.scope).toBe('diet');
    st().undoRemoved();
    expect(st().diet.map(e => e.id)).toEqual([a, b]);
  });
  it('removes quietly when asked (the "Ate this" undo)', () => {
    const id = st().addDietEntry(rice).id!;
    st().removeDietEntry(id, false);
    expect(st().diet).toEqual([]);
    expect(st().removed).toBeNull();
  });
});

describe('setDietTarget', () => {
  it('stores only what you typed, clears with null, and drops the key when empty', () => {
    expect(st().setDietTarget('kcal', 3000)).toBeNull();
    expect(st().cfg.diet).toEqual({ kcal: 3000 });
    expect(st().setDietTarget('protein', 180)).toBeNull();
    expect(st().cfg.diet).toEqual({ kcal: 3000, protein: 180 });
    st().setDietTarget('kcal', null); st().setDietTarget('protein', null);
    expect(st().cfg).not.toHaveProperty('diet');
  });
  it('refuses a number out of range', () => {
    expect(st().setDietTarget('kcal', 100)).toMatch(/Calories/);
    expect(st().setDietTarget('protein', 5)).toMatch(/Protein/);
    expect(st().cfg).not.toHaveProperty('diet');
  });
});

describe('setDietPace', () => {
  it('stores a preset, Custom with its rate, and goes back to the default with null', () => {
    expect(st().setDietPace('fast')).toBeNull();
    expect(st().cfg.diet).toEqual({ pace: 'fast' });
    expect(st().setDietPace('custom', 0.8)).toBeNull();
    expect(st().cfg.diet).toEqual({ pace: 'custom', rate: 0.8 });
    expect(st().setDietPace('slow')).toBeNull();
    expect(st().cfg.diet).toEqual({ pace: 'slow' }); // the Custom rate does not linger
    st().setDietPace(null);
    expect(st().cfg).not.toHaveProperty('diet');
  });
  it('refuses a Custom rate out of range or missing, and keeps the typed targets when the pace changes', () => {
    expect(st().setDietPace('custom', 9)).toMatch(/Pace/);
    expect(st().setDietPace('custom')).toMatch(/Pace/);
    expect(st().cfg).not.toHaveProperty('diet');
    st().setDietTarget('kcal', 3000); st().setDietPace('steady');
    expect(st().cfg.diet).toEqual({ kcal: 3000, pace: 'steady' });
    st().setDietTarget('kcal', null);
    expect(st().cfg.diet).toEqual({ pace: 'steady' }); // clearing the typed numbers keeps the pace
  });
});

describe('the data file', () => {
  it('carries the log and the targets out and back in', async () => {
    const { buildDataFile, parseDataFile } = await import('../lib/export.js');
    st().addDietEntry(rice); st().setDietTarget('kcal', 3000);
    const text = JSON.stringify(buildDataFile(st().snapshot(), {}));
    const back = parseDataFile(text);
    expect(back.diet).toEqual(st().diet);
    expect(back.config.diet).toEqual({ kcal: 3000 });
  });
  it('leaves the log out of the file when there is none', async () => {
    const { buildDataFile } = await import('../lib/export.js');
    expect(buildDataFile(st().snapshot(), {})).not.toHaveProperty('diet');
  });
});
