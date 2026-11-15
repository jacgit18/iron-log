// The backup keeps up with the data (audit 2026-11-10-backup-coverage). `buildDataFile` writes a named list of documents, so a new kind of
// data is only saved when someone adds it there. These tests fail when a store document or snapshot key is neither written to the data file
// nor on a named exclusion list with a reason, and round-trip a fully filled supplement item, so a field added to one without the other shows up here.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { clearStorage } from '../test/browserStubs.js';

let useAppStore: any, buildDataFile: any, normSupplements: any, summarizeSets: any;
const st = () => useAppStore.getState();
const tick = () => new Promise(r => setTimeout(r, 0));

/** Every kind of document the app syncs (`PathKind` in src/sync/documents.ts) and where its data goes in the data file, or why it is left out. */
const DOCUMENTS: Record<string, { file: string } | { excluded: string }> = {
  logs: { file: 'logs' },
  weeks: { file: 'weeks' },
  stretchweeks: { file: 'stretchWeeks' },
  body: { file: 'body' },
  library: { file: 'library' },
  diet: { file: 'diet' },
  recipes: { file: 'recipes' },
  experiments: { file: 'experiments' },
  stretches: { file: 'stretches' },
  supplements: { file: 'supplements' },
  config: { file: 'config' },
  programs: { file: 'programs' },
  grocery: { file: 'grocery' },
  grocerymonths: { file: 'grocery' }, // inside `grocery.months`
};

/** Every key of the full snapshot (`fullSnapshot()`) and the data-file key that carries it. A new snapshot key has to be added here, which is the moment to decide. */
const SNAPSHOT_KEYS: Record<string, string | { excluded: string }> = {
  cfg: 'config', logs: 'logs', programs: 'programs', library: 'library', body: 'body', experiments: 'experiments', recipes: 'recipes', diet: 'diet',
  stretches: 'stretches', stretchExps: 'stretches', supp: 'supplements', grocery: 'grocery', stretchWeeks: 'stretchWeeks',
};

/** Top-level keys of the data file that are not data. */
const FILE_META = ['app', 'format', 'exportedAt'];

/** What the person owns but the data file does not hold, each with the reason and where it is kept instead. */
const NOT_IN_DATA_FILE: Record<string, string> = {
  'saved receipts (photos and notes)': 'kept on the server, downloaded as a zip from Receipts (src/lib/receiptsExport.ts), too big for a JSON file',
  'push, water-reminder and rest-notification switches': 'per device (browser permission and subscription), set again on a new device',
  'appearance, device name, dismissed tips': 'per device, not the person\'s data',
  'plan and admin flags': 'the account\'s on the server, never a thing a restore may set',
};

const pristine: Record<string, unknown> = {};
beforeAll(async () => {
  ({ useAppStore } = await import('./useAppStore.js'));
  ({ buildDataFile } = await import('../lib/export.js'));
  ({ normSupplements } = await import('../lib/water.js'));
  ({ summarizeSets } = await import('../lib/logic.js'));
  await st().init();
  const s = st();
  Object.assign(pristine, structuredClone({ cfg: s.cfg, logs: {}, week: s.week, weekHist: {}, body: [], library: [], experiments: [], recipes: [], diet: [], stretches: [], stretchExps: [], strWeek: s.strWeek, supp: normSupplements(null), grocery: { stores: [], items: [] }, groceryMonths: {}, programs: s.programs }));
});
beforeEach(() => { clearStorage(); useAppStore.setState({ ...structuredClone(pristine), modal: null, importDraft: null, importBusy: false, importError: '', importCount: 0, saveFlag: '', uncheckNote: null, orderNote: null, moveNote: null }); });

const exportData = async () => JSON.parse((await st().buildExportFile('data')).data);
const withoutTime = ({ exportedAt: _t, ...rest }: any) => rest;

// A supplement with every field the item can carry (serving, nutrients, active ingredients, portion, the time of day, dose, note), one ticked on a day, and water and a boost.
const SUPP_ITEM = { id: 'mg-night', n: 'Magnesium glycinate', slot: 'night', dose: '2 capsules', note: 'with dinner', serving: { units: 2, form: 'Capsule' }, nutrients: [{ key: 'magnesium', amount: 200, unit: 'mg' }, { key: 'zinc', amount: 5, unit: 'mg' }, { key: 'biotin', amount: 300, unit: 'mcg' }], portion: 0.5, ingredients: [{ name: 'Omega-3', amount: 500, unit: 'mg' }, { name: 'L-theanine', amount: 200, unit: 'mg' }] };
const SUPP_LIB = { id: 'c:dsld:12345', n: 'Vitamin D3', slot: '', brand: 'Acme', catalogId: 'c:dsld:12345', serving: { units: 1, form: 'Softgel' }, nutrients: [{ key: 'vitaminD', amount: 50, unit: 'mcg' }] };

async function fillEverything() {
  const wk = st().weekKey();
  const mine = structuredClone(st().programs.A); mine.days[0].title = 'Push day';
  useAppStore.setState({
    cfg: { ...structuredClone(pristine.cfg as object), rest: 120, groceryBudget: 40000, bwGoal: { w: 175, d: wk }, profile: { birthYear: 1990, sex: 'male' }, diet: { kcal: 2200, protein: 150, pace: 'steady' }, equipment: { 'x:bands': 'Bands' }, freqGoals: { hack: 2 }, injuryPrevention: false, hideKg: true, recipeChips: { hide: ['drinks'], order: ['sides'] }, ingredientLimits: { 'omega-3': { kind: 'cap', amount: 3000, unit: 'mg', name: 'Omega-3' } } },
    recipes: [{ id: 'chili-ab12', n: 'Chili', cat: 'protein', tags: ['Meal prep'], ing: [{ n: 'beans' }], steps: ['Simmer.'], servings: 4, kcal: 400, p: 30, micro: { iron: 3 } }],
    diet: [{ id: 'f1', d: wk, n: 'Oats', kcal: 300, p: 10, c: 50, f: 5, t: 8, micro: { calcium: 120 } }],
    programs: { A: mine, B: st().programs.B },
    body: [{ wk, d: wk, w: 181.5 }],
    experiments: [{ id: 'E1', ex: 'hack', ph: 'hyp', note: 'slower tempo' }],
    stretches: [{ id: 's1', n: 'Doorway stretch', group: 'chest', tier: 'primary', note: 'hold 30 s' }],
    stretchExps: [{ id: 'x1', n: 'Couch stretch' }],
    grocery: { stores: ['Veg market'], items: [{ id: 'kale', n: 'Kale', store: 'Veg market', qty: 2, cents: 250, every: true, out: false }] },
    groceryMonths: { '2026-09': { lines: { kale: { got: true, at: '2026-09-03T10:15', qty: 3, cents: 260, buys: [{ at: '2026-09-01T09:00', qty: 1, cents: 250, store: 'Veg market' }] } }, pulled: [] } },
    supp: { waterGoal: 100, waterMode: 'fixed', water: { [wk]: [8, 16] }, boost: { [wk]: { hot: true, mins: 45 } }, items: [SUPP_ITEM, SUPP_LIB], taken: { [wk]: { 'mg-night': true } } },
  });
  st().submitLog('A-d1s1', 0, { entry: { d: wk, ph: 'hyp', ...summarizeSets([{ w: 45, r: 12 }], false), slot: 'A-d1s1', wk, n: 'felt good' }, ph: 'hyp', done: true });
  st().checkCard('A-d3s1', true);
  await tick();
}

describe('backup coverage', () => {
  it('every kind of synced document is in the data file or on the exclusion list', () => {
    const src = readFileSync(new URL('../sync/documents.ts', import.meta.url), 'utf8');
    const union = src.slice(src.indexOf('export type PathKind'), src.indexOf('/** The path kind for a store path'));
    const kinds = [...union.matchAll(/kind: '([a-z]+)'/g)].map(m => m[1]!);
    expect(kinds.length).toBeGreaterThan(10); // the scan found the union
    expect(Object.keys(DOCUMENTS).sort()).toEqual([...kinds].sort()); // a new document kind (or a removed one) is a decision in DOCUMENTS above
    Object.values(DOCUMENTS).forEach(d => { if ('excluded' in d) expect(d.excluded.length).toBeGreaterThan(10); });
  });

  it('every key of the full snapshot reaches the data file or is excluded with a reason', async () => {
    await fillEverything();
    const snap = await st().fullSnapshot();
    expect(Object.keys(snap).sort()).toEqual(Object.keys(SNAPSHOT_KEYS).sort()); // a new snapshot key must be mapped above
    const file = buildDataFile(snap, await st().allWeeks());
    Object.entries(SNAPSHOT_KEYS).forEach(([key, to]) => {
      if (typeof to !== 'string') { expect(to.excluded.length).toBeGreaterThan(10); return; }
      expect(Object.keys(file), `snapshot key ${key} should be written as ${to}`).toContain(to);
    });
  });

  it('the data file has no top-level key that is not a snapshot or document key', async () => {
    await fillEverything();
    const file = JSON.parse(JSON.stringify(buildDataFile(await st().fullSnapshot(), await st().allWeeks())));
    const known = new Set([...FILE_META, ...Object.values(DOCUMENTS).flatMap(d => ('file' in d ? [d.file] : [])), ...Object.values(SNAPSHOT_KEYS).filter((v): v is string => typeof v === 'string')]);
    Object.keys(file).forEach(k => expect(known.has(k), `data file key ${k} is not mapped`).toBe(true));
  });

  it('what is kept outside the data file is named with its reason', () => {
    Object.entries(NOT_IN_DATA_FILE).forEach(([what, why]) => expect(why.length, what).toBeGreaterThan(20));
  });

  it('a filled supplement round trips: serving, nutrients, portion and time of day', async () => {
    await fillEverything();
    const first = await exportData();
    const item = first.supplements.items.find((x: any) => x.id === 'mg-night');
    expect(item).toEqual(SUPP_ITEM); // the file keeps every field of the item, none cleaned away
    expect(first.supplements.items.find((x: any) => x.id === SUPP_LIB.id)).toEqual(SUPP_LIB);
    expect(Object.values(first.supplements.taken)[0]).toEqual({ 'mg-night': true });
    expect(first.supplements.boost[st().weekKey()]).toEqual({ hot: true, mins: 45 });

    useAppStore.setState({ ...structuredClone(pristine) }); clearStorage();
    const wiped = await exportData();
    expect(wiped.supplements.items).toEqual([]); // the wipe worked
    expect(wiped.recipes).toBeUndefined();
    expect(wiped.diet).toBeUndefined();

    await st().pasteImport(JSON.stringify(first));
    await st().applyImport('replace'); await tick();
    expect(st().supp.items.find((x: any) => x.id === 'mg-night')).toEqual(SUPP_ITEM);
    const second = await exportData();
    expect(withoutTime(second)).toEqual(withoutTime(first));
  });

  it('settings, food log, recipes and grocery months survive the same round trip', async () => {
    await fillEverything();
    const first = await exportData();
    expect(first.config.profile).toEqual({ birthYear: 1990, sex: 'male' });
    expect(first.config.diet.kcal).toBe(2200);
    expect(first.config.groceryBudget).toBe(40000);
    expect(first.config.equipment).toEqual({ 'x:bands': 'Bands' });
    expect(first.diet[0].t).toBe(8);
    expect(first.diet[0].micro).toEqual({ calcium: 120 });
    expect(first.recipes[0].micro).toEqual({ iron: 3 });
    expect(first.grocery.months['2026-09'].lines.kale.got).toBe(true);
    expect(first.grocery.months['2026-09'].lines.kale.buys).toEqual([{ at: '2026-09-01T09:00', qty: 1, cents: 250, store: 'Veg market' }]); // the purchases Ran out closed
    expect(first.grocery.months['2026-09'].lines.kale.at).toBe('2026-09-03T10:15');
    expect(first.config.ingredientLimits).toEqual({ 'omega-3': { kind: 'cap', amount: 3000, unit: 'mg', name: 'Omega-3' } });

    useAppStore.setState({ ...structuredClone(pristine) }); clearStorage();
    await st().pasteImport(JSON.stringify(first));
    await st().applyImport('replace'); await tick();
    expect(withoutTime(await exportData())).toEqual(withoutTime(first));
  });
});
