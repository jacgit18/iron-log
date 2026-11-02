// The data file is the one backup (ADR 035). This fills every kind of data, exports it, wipes the store, restores the file with Replace,
// and exports again: the two files must match (only the export time differs), so nothing is lost or changed on the way.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

let useAppStore, BUILTIN, DEFAULT_CFG, summarizeSets, normSupplements;
const st = () => useAppStore.getState();
const tick = () => new Promise(r => setTimeout(r, 0));

const blank = () => ({
  cfg: structuredClone(DEFAULT_CFG), logs: {}, week: { prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} }, weekHist: {},
  body: [], library: [], experiments: [], stretches: [], stretchExps: [], supp: normSupplements(null), grocery: { stores: [], items: [] }, groceryMonths: {}, programs: { A: BUILTIN.A, B: BUILTIN.B }, modal: null,
  importDraft: null, importBusy: false, importError: '', importCount: 0, saveFlag: '', uncheckNote: null, orderNote: null, moveNote: null,
});

beforeAll(async () => {
  ({ useAppStore } = await import('./useAppStore.js'));
  ({ BUILTIN } = await import('../lib/data.js'));
  ({ DEFAULT_CFG, summarizeSets } = await import('../lib/logic.js'));
  ({ normSupplements } = await import('../lib/water.js'));
  await st().init();
});
beforeEach(() => { clearStorage(); useAppStore.setState(blank()); });

// What a person can have in the app, one of each kind, written the way the app writes it.
async function fillEverything() {
  const wk = st().weekKey();
  const mine = structuredClone(BUILTIN.A); mine.days[0].title = 'Push day';
  useAppStore.setState({
    cfg: { ...structuredClone(DEFAULT_CFG), rest: 120, recipeChips: { hide: ['drinks'], order: ['sides', 'protein'] } },
    recipes: [{ id: 'chili-ab12', n: 'Chili', cat: 'protein', tags: ['Meal prep', 'weeknight'], ing: [{ n: 'beans' }], steps: ['Simmer.'] }],
    programs: { A: mine, B: BUILTIN.B },
    body: [{ wk, d: wk, w: 181.5 }],
    experiments: [{ id: 'E1', ex: 'hack', ph: 'hyp', note: 'try a slower tempo' }],
    stretches: [{ id: 's1', n: 'Doorway stretch', group: 'chest', tier: 'primary', note: 'hold 30 s' }],
    stretchExps: [{ id: 'x1', n: 'Couch stretch' }],
    grocery: { stores: ['Veg market'], items: [{ id: 'kale', n: 'Kale', store: 'Veg market', qty: 2, cents: 250, every: true, out: false, share: { with: ['p1'] } }], groups: [{ id: 'g1', n: 'Home', people: [{ id: 'p1', n: 'Sam', covered: true }], stores: ['Veg market'] }] },
    groceryMonths: { '2026-09': { lines: { kale: { got: true, qty: 3, cents: 260, share: { with: ['p1'], notMine: true } } }, pulled: [], payer: { 'Veg market': 'p1' } } },
    supp: { waterGoal: 100, waterMode: 'fixed', water: { [wk]: [8, 16] }, boost: { [wk]: { hot: true, mins: 45 } }, items: [], taken: {} },
  });
  st().submitLog('A-d1s1', 0, { entry: { d: wk, ph: 'hyp', ...summarizeSets([{ w: 45, r: 12 }, { w: 50, r: 10 }], false), slot: 'A-d1s1', wk, n: 'felt good' }, ph: 'hyp', done: true });
  st().checkCard('A-d3s1', true);
  await tick();
}

// buildExportFile hands back the file's text.
const exportData = async () => JSON.parse((await st().buildExportFile('data')).data);
const withoutTime = f => { const { exportedAt: _t, ...rest } = f; return rest; };

describe('backup round trip', () => {
  it('export, wipe, Replace restore, export again gives the same file', async () => {
    await fillEverything();
    const first = await exportData();
    // The fill really reached the file, so an empty round trip cannot pass by accident.
    expect(Object.values(first.logs).flat().length).toBeGreaterThan(0);
    expect(first.config.rest).toBe(120);
    expect(first.programs.A.days[0].title).toBe('Push day');
    expect(first.recipes[0].tags).toEqual(['Meal prep', 'weeknight']); // recipe tags and the chip setting are in the file
    expect(first.config.recipeChips).toEqual({ hide: ['drinks'], order: ['sides', 'protein'] });
    expect(first.body).toHaveLength(1);
    expect(first.experiments).toHaveLength(1);
    expect(first.stretches.items).toHaveLength(1);
    expect(first.supplements.water).not.toEqual({});
    expect(Object.keys(first.weeks).length).toBeGreaterThan(0);
    expect(first.grocery.items).toHaveLength(1);
    expect(first.grocery.months['2026-09'].lines.kale.got).toBe(true);
    expect(first.grocery.groups[0].people[0]).toEqual({ id: 'p1', n: 'Sam', covered: true }); // sharing groups, shares and who paid are in the file
    expect(first.grocery.items[0].share).toEqual({ with: ['p1'] });
    expect(first.grocery.months['2026-09'].payer).toEqual({ 'Veg market': 'p1' });

    useAppStore.setState(blank()); clearStorage();
    const wiped = await exportData(); // the wipe worked: nothing of what was filled is left
    expect(wiped.body).toEqual([]);
    expect(wiped.supplements.water).toEqual({});
    expect(wiped.experiments).toEqual([]);

    st().pasteImport(JSON.stringify(first));
    await st().applyImport('replace'); await tick();
    const second = await exportData();
    expect(withoutTime(second)).toEqual(withoutTime(first));
  });

  it('a second Replace of the same file changes nothing', async () => {
    await fillEverything();
    const file = await exportData();
    st().pasteImport(JSON.stringify(file)); await st().applyImport('replace'); await tick();
    const once = await exportData();
    st().pasteImport(JSON.stringify(file)); await st().applyImport('replace'); await tick();
    const twice = await exportData();
    expect(withoutTime(twice)).toEqual(withoutTime(once));
  });
});
