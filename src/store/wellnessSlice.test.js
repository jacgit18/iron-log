import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage, saved } from '../test/browserStubs.js';

let useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { DEFAULT_STRETCHES, normStretchWeek } = await import('../lib/stretches.js');
  const { normSupplements } = await import('../lib/water.js');
  useAppStore.setState({ stretches: structuredClone(DEFAULT_STRETCHES), stretchExps: [], strWeek: normStretchWeek(null), supp: normSupplements(null), modal: null });
});

describe('stretches', () => {
  it('ticks a stretch for one day and saves the week', () => {
    st().setStretchDone(2, 'scarecrow', true);
    expect(st().strWeek.done).toEqual({ '2:scarecrow': true });
    expect(saved('stretchweeks/' + st().weekKey()).done).toEqual({ '2:scarecrow': true });
    st().setStretchDone(2, 'scarecrow', false);
    expect(st().strWeek.done).toEqual({});
  });
  it('ticks a warm-up item for one day without counting it toward the stretches', async () => {
    const { warmKey, isStretchDone, dayTally } = await import('../lib/stretches.js');
    st().setStretchDone(2, warmKey('shadow'), true);
    expect(st().strWeek.done).toEqual({ '2:warm:shadow': true });
    expect(isStretchDone(st().strWeek, 2, warmKey('shadow'))).toBe(true);
    expect(isStretchDone(st().strWeek, 3, warmKey('shadow'))).toBe(false);
    expect(dayTally(st().stretches, st().strWeek, 2).done).toBe(0);
    st().setStretchDone(2, warmKey('shadow'), false);
  });
  it('adds, edits and deletes a library stretch, and rejects a duplicate name or bad link', () => {
    expect(st().saveStretch({ n: 'Cossack Squat', group: 'Squatting', tier: 'primary', url: 'https://youtu.be/x' })).toBeNull();
    const item = st().stretches.find(i => i.n === 'Cossack Squat');
    expect(item).toMatchObject({ id: 'cossack-squat', group: 'Squatting', tier: 'primary' });
    expect(st().saveStretch({ n: 'cossack squat' })).toMatch(/already/);
    expect(st().saveStretch({ n: 'New one', url: 'nope' })).toMatch(/https/);
    expect(st().saveStretch({ id: item.id, n: 'Cossack Squat', group: 'Squatting', tier: '' })).toBeNull();
    expect(st().stretches.find(i => i.id === item.id).tier).toBe('');
    st().setStretchDone(0, item.id, true);
    st().deleteStretch(item.id);
    expect(st().stretches.find(i => i.id === item.id)).toBeUndefined();
    expect(st().strWeek.done).toEqual({});
    expect(saved('stretches/main').items.some(i => i.id === item.id)).toBe(false);
  });
  it('adds an experiment to a day and removes it again with its check-off', () => {
    expect(st().saveStretchExp({ n: 'Frog Stretch', note: 'try' })).toBeNull();
    const e = st().stretchExps[0];
    expect(st().addStretchToDay(e.id, 3)).toBe(true);
    const x = st().strWeek.extra[0]; expect(x).toMatchObject({ day: 3, n: 'Frog Stretch' });
    st().setStretchDone(3, x.id, true);
    st().removeStretchExtra(x.id);
    expect(st().strWeek).toEqual({ done: {}, skipped: {}, extra: [] });
    st().deleteStretchExp(e.id);
    expect(st().stretchExps).toEqual([]);
  });
  it('skips a whole day, keeping its ticks, and undoes the skip', () => {
    st().setStretchDone(1, 'scarecrow', true);
    st().skipStretchDay(1, true);
    expect(st().strWeek.skipped).toEqual({ 1: true });
    expect(saved('stretchweeks/' + st().weekKey()).skipped).toEqual({ 1: true });
    st().skipStretchDay(1, false);
    expect(st().strWeek).toMatchObject({ skipped: {}, done: { '1:scarecrow': true } });
  });
  it('moves a stretch within its group only', () => {
    st().moveStretch('v-raise', -1);
    expect(st().stretches.map(i => i.id).slice(0, 2)).toEqual(['v-raise', 'scarecrow']);
    st().moveStretch('v-raise', -1); // already first in Bands: nothing to swap with
    expect(st().stretches[0].id).toBe('v-raise');
  });
});

describe('water', () => {
  it('logs drinks, takes one back, and removes an emptied day', () => {
    st().addWater('2026-10-04', 16.9); st().addWater('2026-10-04', 8);
    expect(st().supp.water['2026-10-04']).toEqual([16.9, 8]);
    expect(saved('supplements/main').water['2026-10-04']).toEqual([16.9, 8]);
    st().removeWater('2026-10-04', 0); st().removeWater('2026-10-04', 0);
    expect(st().supp.water).toEqual({});
  });
  it('a typed goal is fixed until you go back to your weight', () => {
    expect(st().supp.waterMode).toBe('weight');
    st().setWaterGoal(100); expect(st().supp).toMatchObject({ waterGoal: 100, waterMode: 'fixed' });
    st().setWaterByWeight(); expect(st().supp.waterMode).toBe('weight');
  });
  it('refuses a bad amount or goal', () => {
    expect(st().addWater('2026-10-04', 0)).toBe(false); expect(st().addWater('2026-10-04', 'x')).toBe(false);
    expect(st().setWaterGoal(2)).toBe(false);
    expect(st().setWaterGoal(100)).toBe(true); expect(st().supp.waterGoal).toBe(100);
  });
});

describe('supplement library', () => {
  it('adds to a section, ticks per date, and taking it off the schedule keeps it in the library', () => {
    expect(st().addSupplement('morning', 'Vitamin D', '2000 IU')).toBe(true);
    expect(st().addSupplement('lunch', 'X')).toBe(false); expect(st().addSupplement('night', '  ')).toBe(false);
    const x = st().supp.items[0]; expect(x).toMatchObject({ id: 'vitamin-d', n: 'Vitamin D', dose: '2000 IU', slot: 'morning' });
    st().setSupplementTaken('2026-10-04', x.id, true);
    expect(saved('supplements/main').taken).toEqual({ '2026-10-04': { [x.id]: true } });
    st().removeSupplement(x.id);
    expect(st().supp.items[0].slot).toBe('');
    st().setSupplementSlot(x.id, 'night'); expect(st().supp.items[0].slot).toBe('night');
  });
  it('saves from the library sheet, rejects a duplicate name, and deleting clears the ticks', () => {
    expect(st().saveSupplement({ n: 'Creatine', dose: '5 g', slot: '' })).toBeNull();
    expect(st().saveSupplement({ n: 'creatine' })).toMatch(/already/);
    expect(st().saveSupplement({ n: ' ' })).toMatch(/name/);
    const x = st().supp.items[0];
    expect(st().saveSupplement({ id: x.id, n: 'Creatine', dose: '5 g', slot: 'noon', note: 'daily' })).toBeNull();
    expect(st().supp.items[0]).toMatchObject({ slot: 'noon', note: 'daily' });
    st().setSupplementTaken('2026-10-05', x.id, true);
    st().deleteSupplement(x.id);
    expect(st().supp.items).toEqual([]); expect(st().supp.taken).toEqual({});
  });
  it('moves within a section only', () => {
    st().addSupplement('morning', 'A'); st().addSupplement('night', 'B'); st().addSupplement('morning', 'C');
    st().moveSupplement('c', -1);
    expect(st().supp.items.map(i => i.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('backup file', () => {
  it('round-trips the stretches and water', async () => {
    const { buildDataFile, normalizeData } = await import('../lib/export.js');
    st().setStretchDone(1, 'scarecrow', true); st().addWater('2026-10-04', 12);
    const S = { ...st().snapshot(), stretchWeeks: { [st().weekKey()]: st().strWeek } };
    const d = normalizeData(JSON.parse(JSON.stringify(buildDataFile(S, {}))));
    expect(d.stretches.items.length).toBe(S.stretches.length);
    expect(d.stretchWeeks[st().weekKey()].done).toEqual({ '1:scarecrow': true });
    expect(d.supplements.water['2026-10-04']).toEqual([12]);
  });
});
