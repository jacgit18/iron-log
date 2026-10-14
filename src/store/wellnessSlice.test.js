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
  // Catalog stretches (ADR 026, 027): a snapshot with its catalog id, Library only, grouped by its main muscle.
  it('adds a catalog stretch as Library only under its main muscle, keeps its id and name through edits, and refuses a second add or a name in use', () => {
    const calf = { id: 'c:fedb:Calf_Stretch', name: ' Calf  Stretch ', data: { muscles: { p: ['calves'], mob: true } } };
    expect(st().addCatalogStretch(calf)).toBeNull();
    const item = st().stretches.find(i => i.catalogId === calf.id);
    expect(item).toEqual({ id: 'calf-stretch', n: 'Calf Stretch', group: 'Calves', tier: '', catalogId: calf.id });
    expect(saved('stretches/main').items.find(i => i.id === item.id).catalogId).toBe(calf.id);
    expect(st().addCatalogStretch(calf)).toMatch(/Already in your stretches/);
    expect(st().addCatalogStretch({ ...calf, id: 'c:fedb:Other' })).toMatch(/already have a stretch called Calf Stretch/);
    expect(st().addCatalogStretch({ ...calf, id: 'calf' })).toMatch(/can’t be added/);
    // starts with c: but not the validator's shape: refused, so it can't be saved as Library and stripped to Custom later
    expect(st().addCatalogStretch({ ...calf, id: 'c:FEDB:Calf Stretch' })).toMatch(/can’t be added/);
    // edited onto every day with a link: tier, group and link change, the name and catalog id stay
    expect(st().saveStretch({ id: item.id, n: 'Renamed', group: 'Legs', tier: 'primary', url: 'https://youtu.be/c' })).toBeNull();
    expect(st().stretches.find(i => i.id === item.id)).toEqual({ id: 'calf-stretch', n: 'Calf Stretch', group: 'Legs', tier: 'primary', url: 'https://youtu.be/c', catalogId: calf.id });
  });
  it('saves a new stretch picked from the catalog in the sheet with its id and name, the tier and group chosen there (ADR 036)', () => {
    const calf = { id: 'c:fedb:Calf_Stretch', name: 'Calf Stretch', data: { muscles: { p: ['calves'] } } };
    expect(st().saveStretch({ n: 'whatever typed', cat: calf, group: 'Calves', tier: 'primary', note: 'wall' })).toBeNull();
    const item = st().stretches.find(i => i.catalogId === calf.id);
    expect(item).toMatchObject({ n: 'Calf Stretch', group: 'Calves', tier: 'primary', note: 'wall', catalogId: calf.id });
    expect(st().saveStretch({ n: '', cat: calf, tier: '' })).toBe('Already in your stretches.');
    expect(st().saveStretch({ n: '', cat: { ...calf, id: 'c:FEDB:bad id' } })).toMatch(/can’t be added/);
    expect(st().saveStretch({ n: '', cat: { ...calf, id: 'c:fedb:Other' } })).toBe('Another stretch already has that name.');
    // editing keeps it a catalog stretch; a cat sent with an edit is ignored
    expect(st().saveStretch({ id: item.id, n: 'Calf Stretch', cat: { ...calf, id: 'c:fedb:Other', name: 'Other' }, group: 'Legs', tier: '' })).toBeNull();
    expect(st().stretches.find(i => i.id === item.id)).toMatchObject({ n: 'Calf Stretch', catalogId: calf.id, group: 'Legs' });
  });
  it('a catalog stretch with no primary muscle goes in Other', () => {
    st().addCatalogStretch({ id: 'c:fedb:X', name: 'Mystery Stretch', data: {} });
    expect(st().stretches.find(i => i.catalogId === 'c:fedb:X').group).toBe('Other');
  });
  it('Undo puts a deleted stretch back in its place with this week’s ticks', () => {
    const before = st().stretches.map(i => i.id); const id = before[1];
    st().setStretchDone(0, id, true); st().setStretchDone(3, id, true); st().setStretchDone(0, before[0], true);
    const done = { ...st().strWeek.done };
    st().deleteStretch(id);
    expect(st().removed).toMatchObject({ scope: 'stretches' });
    st().undoRemoved();
    expect(st().stretches.map(i => i.id)).toEqual(before);
    expect(st().strWeek.done).toEqual(done);
    expect(saved('stretches/main').items.map(i => i.id)).toEqual(before);
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
  it('refuses a stretch experiment that is already on the list or already in your stretches', () => {
    expect(st().saveStretchExp({ n: 'Frog Stretch' })).toBeNull();
    expect(st().saveStretchExp({ n: ' frog  stretch ' })).toMatch(/already on the Experiment list/);
    const own = st().stretches[0].n;
    expect(st().saveStretchExp({ n: own.toUpperCase() })).toMatch(/already have that stretch/);
    expect(st().stretchExps).toHaveLength(1);
    const e = st().stretchExps[0]; // editing it keeps its own name
    expect(st().saveStretchExp({ id: e.id, n: 'Frog Stretch', note: 'x' })).toBeNull();
    expect(st().stretchExps).toHaveLength(1);
  });
  it('still edits an experiment whose name became one of your stretches later', () => {
    expect(st().saveStretchExp({ n: 'Frog Stretch' })).toBeNull();
    const e = st().stretchExps[0];
    st().mutateStretches(x => { x.items.push({ id: 'frog', n: 'Frog Stretch', group: 'Standing', tier: 'primary' }); });
    expect(st().saveStretchExp({ id: e.id, n: 'Frog Stretch', note: 'new note' })).toBeNull();
    expect(st().stretchExps[0].note).toBe('new note');
    expect(st().saveStretchExp({ id: e.id, n: st().stretches[0].n })).toMatch(/already have that stretch/); // renaming onto one is still refused
  });
  it('keeps the group a catalog stretch came with on the experiment, and drops a blank one', async () => {
    const { normStretchExperimentItem } = await import('../shared/listItems.js');
    expect(st().saveStretchExp({ n: 'Calf Stretch', group: ' Calves ' })).toBeNull();
    expect(st().stretchExps[0]).toMatchObject({ n: 'Calf Stretch', group: 'Calves' });
    expect(saved('stretches/main').experiments[0].group).toBe('Calves');
    const e = st().stretchExps[0];
    expect(st().saveStretchExp({ id: e.id, n: 'Calf Stretch', group: '' })).toBeNull();
    expect('group' in st().stretchExps[0]).toBe(false);
    expect(normStretchExperimentItem({ id: 'a', n: 'X', group: 'g'.repeat(60) }).group).toHaveLength(40);
    expect(normStretchExperimentItem({ id: 'a', n: 'X', group: 5 })).toEqual({ id: 'a', n: 'X' });
  });
  it('Undo puts back a removed day stretch with its tick, and a deleted experiment', () => {
    expect(st().saveStretchExp({ n: 'Frog Stretch', note: 'try' })).toBeNull();
    const e = st().stretchExps[0];
    st().addStretchToDay(e.id, 3); const x = st().strWeek.extra[0]; st().setStretchDone(3, x.id, true);
    const week = structuredClone(st().strWeek);
    st().removeStretchExtra(x.id);
    expect(st().removed).toMatchObject({ scope: `sday:${st().weekKey()}:3`, text: 'Frog Stretch from Wednesday' });
    st().undoRemoved();
    expect(st().strWeek).toEqual(week);
    st().deleteStretchExp(e.id);
    st().undoRemoved();
    expect(st().stretchExps).toEqual([e]);
    expect(saved('stretches/main').experiments).toEqual([e]);
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
  it('Undo puts a removed drink back in its place', () => {
    st().addWater('2026-10-04', 16.9); st().addWater('2026-10-04', 8); st().addWater('2026-10-04', 12);
    st().removeWater('2026-10-04', 1);
    expect(st().removed).toMatchObject({ scope: 'water:2026-10-04', text: '8 oz of water' });
    st().undoRemoved();
    expect(st().supp.water['2026-10-04']).toEqual([16.9, 8, 12]);
    expect(saved('supplements/main').water['2026-10-04']).toEqual([16.9, 8, 12]);
  });
  it('Undo does not double a drink that was added again meanwhile', () => {
    st().addWater('2026-10-04', 8);
    st().removeWater('2026-10-04', 0);
    st().addWater('2026-10-04', 8); // added again by hand
    st().undoRemoved();
    expect(st().supp.water['2026-10-04']).toEqual([8]);
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
    expect(st().removed).toMatchObject({ scope: 'suppslot:morning', text: 'Vitamin D from Morning' });
    st().undoRemoved(); expect(st().supp.items[0].slot).toBe('morning');
    st().removeSupplement(x.id);
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
  it('from the Supplements tab: a catalog one goes straight into the section with the dose typed, and moving one of yours can set its dose (ADR 036)', () => {
    const now = { id: 'c:dsld:9', name: 'Magnesium', brand: 'NOW Foods', data: {} };
    expect(st().addCatalogSupplement(now, { slot: 'night', dose: ' 200 mg ' })).toBeNull();
    expect(st().supp.items.find(i => i.catalogId === now.id)).toMatchObject({ n: 'Magnesium', brand: 'NOW Foods', slot: 'night', dose: '200 mg' });
    expect(st().addCatalogSupplement({ ...now, id: 'c:dsld:10' }, { slot: 'night' })).toMatch(/already have Magnesium from NOW Foods/);
    expect(st().addCatalogSupplement({ id: 'c:dsld:11', name: 'Zinc', data: {} }, { slot: 'nonsense' })).toBeNull();
    expect(st().supp.items.find(i => i.catalogId === 'c:dsld:11').slot).toBe(''); // an unknown section: Library only
    const zinc = st().supp.items.find(i => i.catalogId === 'c:dsld:11');
    expect(st().setSupplementSlot(zinc.id, 'morning', '15 mg')).toBe(true);
    expect(st().supp.items.find(i => i.id === zinc.id)).toMatchObject({ slot: 'morning', dose: '15 mg' });
    st().setSupplementSlot(zinc.id, 'noon', '');
    expect(st().supp.items.find(i => i.id === zinc.id)).toMatchObject({ slot: 'noon', dose: '15 mg' }); // no dose typed: kept
  });
  // Catalog supplements (ADR 029): name and brand from the catalog, Library only, your own dose; never a dose from the catalog.
  it('adds a catalog supplement as Library only with its brand, keeps name, brand and id through edits, and allows the same name from another brand', () => {
    const now = { id: 'c:dsld:3', name: 'Creatine', brand: 'NOW Foods', data: { form: 'Powder' } };
    expect(st().addCatalogSupplement(now)).toBeNull();
    const x = st().supp.items.find(i => i.catalogId === now.id);
    expect(x).toEqual({ id: 'creatine', n: 'Creatine', slot: '', brand: 'NOW Foods', catalogId: now.id });
    expect(saved('supplements/main').items.find(i => i.id === x.id)).toMatchObject({ brand: 'NOW Foods', catalogId: now.id });
    expect(st().addCatalogSupplement(now)).toMatch(/Already in your supplements/);
    expect(st().addCatalogSupplement({ ...now, id: 'c:dsld:9' })).toMatch(/already have Creatine from NOW Foods/);
    expect(st().addCatalogSupplement({ ...now, id: 'c:dsld:4', brand: 'Optimum Nutrition' })).toBeNull(); // same name, other brand
    expect(st().saveSupplement({ n: 'Creatine', dose: '5 g' })).toBeNull(); // your own plain one too
    expect(st().saveSupplement({ id: x.id, n: 'Renamed', dose: '3 g', slot: 'morning', note: 'with water' })).toBeNull();
    expect(st().supp.items.find(i => i.id === x.id)).toEqual({ id: 'creatine', n: 'Creatine', slot: 'morning', dose: '3 g', note: 'with water', brand: 'NOW Foods', catalogId: now.id });
  });
  it('cuts a long catalog name to 60 characters, and refuses an id that is not a catalog id', () => {
    st().addCatalogSupplement({ id: 'c:dsld:7', name: 'A'.repeat(70), data: {} });
    const x = st().supp.items.find(i => i.catalogId === 'c:dsld:7');
    expect(x.n).toBe(`${'A'.repeat(59)}…`); expect(x).not.toHaveProperty('brand');
    expect(st().addCatalogSupplement({ id: 'creatine', name: 'X', data: {} })).toMatch(/can’t be added/);
  });
  it('Undo puts a deleted supplement back in its place with every day it was ticked', () => {
    st().addSupplement('morning', 'A'); st().addSupplement('morning', 'B'); st().addSupplement('night', 'C');
    st().setSupplementTaken('2026-10-05', 'b', true); st().setSupplementTaken('2026-10-06', 'b', true); st().setSupplementTaken('2026-10-06', 'a', true);
    const before = structuredClone(st().supp);
    st().deleteSupplement('b');
    expect(st().supp.taken['2026-10-05']).toBeUndefined();
    expect(st().removed).toMatchObject({ scope: 'supplements', text: 'B' });
    st().undoRemoved();
    expect(st().supp.items).toEqual(before.items); expect(st().supp.taken).toEqual(before.taken);
    expect(saved('supplements/main').taken).toEqual(before.taken);
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
