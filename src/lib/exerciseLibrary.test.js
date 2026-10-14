import { describe, it, expect } from 'vitest';
import { BUILTIN } from './data.js';
import { DEFAULT_CFG } from './logic.js';
import { libraryRows, filterRows, usageOf, hasTwoSources, keepCatalogItems, exIdsInUse, findExIdIn } from './exerciseLibrary.js';

const cfg = (over = {}) => ({ ...structuredClone(DEFAULT_CFG), ...over });
const state = (over = {}) => ({ programs: { A: BUILTIN.A, B: BUILTIN.B }, library: [], experiments: [], logs: {}, ...over });

describe('exercise library rows', () => {
  it('lists built-in and your own exercises alphabetically, with what is set on each', () => {
    const c = cfg({ ex: { 'my-lift': { n: 'Aardvark Curl', eq: 'cable' } }, exPh: { hack: 'hyp' }, rm: { hack: 400 } });
    const rows = libraryRows(c, state());
    expect(rows[0]).toMatchObject({ id: 'my-lift', name: 'Aardvark Curl', custom: true, eq: 'cable', tagged: false, inPrograms: [] });
    const hack = rows.find(r => r.id === 'hack');
    expect(hack).toMatchObject({ name: 'Hack Squat', eq: 'machine', ph: 'hyp', rm: 400, custom: false, p: ['quads'] });
    expect(hack.inPrograms).toEqual(['A', 'B']);
    expect(rows.map(r => r.name)).toEqual([...rows.map(r => r.name)].sort((a, b) => a.localeCompare(b)));
  });
  it('filters by name, equipment and muscle (primary or secondary), and finds untagged ones', () => {
    const rows = libraryRows(cfg({ ex: { x: { n: 'Mystery Move' } } }), state());
    expect(filterRows(rows, { q: ' hack ' }).map(r => r.id)).toEqual(['hack']);
    expect(filterRows(rows, { eq: 'trx' }).every(r => r.eq === 'trx')).toBe(true);
    expect(filterRows(rows, { muscle: 'glutes' }).some(r => r.id === 'hack')).toBe(true); // secondary counts
    expect(filterRows(rows, { muscle: 'untagged' }).map(r => r.id)).toEqual(['x']);
    expect(filterRows(rows, { eq: 'none' }).some(r => r.id === 'x')).toBe(true);
    expect(filterRows(rows, {})).toHaveLength(rows.length);
  });
  it('splits your own exercises from library ones; editing a built-in does not make it Custom', () => {
    const rows = libraryRows(cfg({ ex: { x: { n: 'Mystery Move' }, hack: { n: 'Hack Squat', eq: 'machine', url: 'https://example.com' } } }), state());
    expect(filterRows(rows, { src: 'custom' }).map(r => r.id)).toEqual(['x']);
    const lib = filterRows(rows, { src: 'library' });
    expect(lib.some(r => r.id === 'hack')).toBe(true);
    expect(lib.some(r => r.id === 'x')).toBe(false);
    expect(lib.length + 1).toBe(rows.length);
    expect(filterRows(rows, { src: 'custom', q: 'hack' })).toEqual([]);
  });
  it('offers the Source filter only when the list holds both Custom and library exercises', () => {
    expect(hasTwoSources(libraryRows(cfg({ ex: { x: { n: 'Mystery Move' } } }), state()))).toBe(true);
    expect(hasTwoSources(libraryRows(cfg(), state()))).toBe(false); // built-ins only
    expect(hasTwoSources([{ custom: true }, { custom: true }])).toBe(false); // synced: all your own
    expect(hasTwoSources([])).toBe(false);
  });
  it('knows where an exercise is used', () => {
    const lib = [{ id: 'v', name: 'v', prog: { days: [{ title: 'D', slots: [{ id: 's', items: [{ ex: 'zzz' }] }] }, ...Array(5).fill({ title: 'D', slots: [] })] } }];
    expect(usageOf('zzz', state({ library: lib, experiments: [{ id: 'e', ex: 'zzz' }], logs: { zzz: [{}, {}] } }))).toEqual({ programs: [], versions: 1, experiments: 1, logs: 2 });
    expect(usageOf('hack', state()).programs).toEqual(['A', 'B']);
  });
});

describe('keepCatalogItems (the library filters on catalog rows, ADR 036)', () => {
  const items = [
    { id: 'c:x:fly', name: 'Cable Fly', data: { eq: 'cable', muscles: { p: ['chest'], s: ['frontdelt'] } } },
    { id: 'c:x:curl', name: 'Barbell Curl', data: { eq: 'barbell', muscles: { p: ['biceps'] } } },
    { id: 'c:x:walk', name: 'Mystery Walk', data: {} },
    { id: 'c:x:mob', name: 'Hip Circles', data: { muscles: { mob: true } } },
  ];
  const ids = f => keepCatalogItems(items, f).map(c => c.id);
  it('keeps everything with no filter', () => expect(ids({})).toEqual(items.map(c => c.id)));
  it('filters by equipment, and "none" keeps the ones with no equipment', () => {
    expect(ids({ eq: 'cable' })).toEqual(['c:x:fly']);
    expect(ids({ eq: 'none' })).toEqual(['c:x:walk', 'c:x:mob']);
  });
  it('filters by a primary or secondary muscle, and "untagged" keeps the ones with no muscles (mobility counts as tagged)', () => {
    expect(ids({ muscle: 'frontdelt' })).toEqual(['c:x:fly']);
    expect(ids({ muscle: 'biceps' })).toEqual(['c:x:curl']);
    expect(ids({ muscle: 'untagged' })).toEqual(['c:x:walk']);
  });
  it('combines both, as the library does', () => expect(ids({ eq: 'barbell', muscle: 'chest' })).toEqual([]));
});

describe('exIdsInUse', () => {
  const prog = ex => ({ key: 'A', days: [{ title: 'D1', slots: [{ id: 's1', sec: 'Regular', items: [{ ex, ph: 'hyp', w: null }] }] }] });
  it('collects ids from programs, saved versions, experiments, logs with entries and this week\'s added cards', () => {
    const ids = exIdsInUse({
      programs: { A: prog('hack'), B: prog('latpd') }, library: [{ id: 'L1', prog: prog('arnold') }], experiments: [{ ex: 'facepull' }],
      logs: { chestpress: [{ d: '2026-10-01' }], gone: [] }, week: { extra: [{ id: 'X', day: 2, ex: 'dip' }] },
    });
    expect(ids.sort()).toEqual(['arnold', 'chestpress', 'dip', 'facepull', 'hack', 'latpd']);
  });
  it('with cfg, keeps only ids that name a real exercise (built-in or your own)', () => {
    const c = cfg({ ex: { mine: { n: 'Mine' } } });
    expect(exIdsInUse({ programs: { A: prog('hack') }, logs: { mine: [{}], 'old-retired-id': [{}] } }, c).sort()).toEqual(['hack', 'mine']);
  });
});

describe('findExIdIn', () => {
  it('finds your own by name first, then a built-in in use the library does not list, and nothing for an unknown name', async () => {
    const { listBuiltinExercises } = await import('./data.js');
    listBuiltinExercises(false); // synced: built-ins are not listed
    try {
      const c = cfg({ ex: { mine: { n: 'My Row' } } });
      expect(findExIdIn(c, ' my  row ', ['hack'])).toBe('mine');
      expect(findExIdIn(c, 'hack squat', ['hack'])).toBe('hack');
      expect(findExIdIn(c, 'Hack Squat', [])).toBeNull();
      expect(findExIdIn(c, '', ['hack'])).toBeNull();
    } finally { listBuiltinExercises(true); }
  });
});
