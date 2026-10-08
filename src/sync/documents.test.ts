import { describe, expect, it } from 'vitest';
import { BUILTIN } from '../lib/data.js';
import { normBody, normEntries, normLibrary } from '../shared/validate.js';
import { normWeek } from '../shared/week.js';
import { desiredRows, documentFor, parsePath, pathsOf, scopeRows, type PathKind } from './documents.js';
import { asRow, mirrorOf } from './testing.js';

const kind = (path: string) => parsePath(path) as PathKind;

describe('parsePath', () => {
  it.each([
    ['logs/squat', { kind: 'logs', exerciseId: 'squat' }],
    ['weeks/2026-10-04', { kind: 'weeks', weekStart: '2026-10-04' }],
    ['stretchweeks/2026-10-04', { kind: 'stretchweeks', weekStart: '2026-10-04' }],
    ['programs/A', { kind: 'programs', key: 'A' }],
    ['programs/B', { kind: 'programs', key: 'B' }],
    ['body/main', { kind: 'body' }],
    ['library/main', { kind: 'library' }],
    ['experiments/main', { kind: 'experiments' }],
    ['stretches/main', { kind: 'stretches' }],
    ['supplements/main', { kind: 'supplements' }],
    ['config/main', { kind: 'config' }],
  ])('%s', (path, expected) => {
    expect(parsePath(path)).toEqual(expected);
  });

  it.each(['', 'logs', 'logs/', 'weeks/nope', 'weeks/2026-13-40', 'programs/C', 'body/other', 'view/main', 'logs/a/b', `logs/${'x'.repeat(101)}`])('is not a synced path: %j', path => {
    expect(parsePath(path)).toBeNull();
  });
});

// The entries a user might have: with sets, a hold, a note, a check-off, and one saved before ids existed.
const entries = [
  { id: 'L1', d: '2026-10-05', ph: 'strength', w: 135, s: 3, r: 5, sets: [{ w: 135, r: 5 }, { w: 135, r: 5 }, { w: 135, r: 4 }], n: 'felt heavy', slot: 'A-d1s1', wk: '2026-10-04', updatedAt: '2026-10-05T12:00:00.000Z' },
  { id: 'L2', d: '2026-10-06', ph: 'iso', sec: 30, s: 3, slot: 'A-d2s1', wk: '2026-10-04', auto: true },
  { d: '2026-10-01', ph: 'hyp', w: 95, s: 4, r: 12 },
] as never[];

describe('rows to document and back', () => {
  // Writes a document, turns it into rows as the server would hold them, reads it back.
  const roundTrip = (path: string, doc: unknown, mirror = new Map()) => {
    const k = kind(path);
    const m = new Map([...mirror, ...mirrorOf(desiredRows(k, doc, mirror))]);
    return documentFor(k, m);
  };

  it('logs: every entry comes back, sorted by date, a legacy entry under its derived id', () => {
    const back = roundTrip('logs/squat', { entries }) as { entries: Record<string, unknown>[] };
    expect(back.entries.map(e => e.d)).toEqual(['2026-10-01', '2026-10-05', '2026-10-06']);
    const want = normEntries(entries).map(e => ({ ...e }));
    expect(back.entries.find(e => e.id === 'L1')).toEqual(want.find(e => e.id === 'L1'));
    expect(back.entries.find(e => e.id === 'L2')).toEqual(want.find(e => e.id === 'L2'));
    expect(String(back.entries[0]!.id)).toMatch(/^k[a-z0-9]+$/);
  });

  it('logs: a path with no entries has no document', () => {
    expect(roundTrip('logs/squat', { entries: [] })).toBeNull();
  });

  it('weeks and stretch weeks', () => {
    const week = { prog: 'A', done: { 'A-d1s1:0': true }, skipped: {}, moved: { 'A-d2s1': 3 }, ph: { 'A-d1s1:0': 'hyp' }, warm: { 1: { w1: true } }, rest: [7], extra: [{ id: 'X-1', day: 2, ex: 'squat', ph: null, note: '' }] };
    expect(roundTrip('weeks/2026-10-04', week)).toEqual(normWeek(week));
    const sw = { done: { '0:scarecrow': true }, skipped: { 2: true }, extra: [{ id: 'e1', day: 3, n: 'Pigeon' }] };
    expect(roundTrip('stretchweeks/2026-10-04', sw)).toEqual(sw);
  });

  it('programs: the body without its key, padded to seven days', () => {
    const body = (({ key: _k, ...b }) => b)(structuredClone(BUILTIN.A));
    expect(roundTrip('programs/A', structuredClone(BUILTIN.A))).toEqual(body);
    expect((roundTrip('programs/B', { days: structuredClone(BUILTIN.B.days).slice(0, 6) }) as { days: unknown[] }).days).toHaveLength(7);
  });

  it('body weight, one entry per week, sorted by week', () => {
    const doc = { entries: [{ wk: '2026-10-11', d: '2026-10-12', w: 181.2 }, { wk: '2026-10-04', d: '2026-10-07', w: 180.5 }] };
    expect(roundTrip('body/main', doc)).toEqual({ schema: 1, entries: normBody(doc.entries).sort((a, b) => a.wk.localeCompare(b.wk)) });
  });

  it('the library, oldest saved first, programs padded', () => {
    const items = [
      { id: 'v2', name: 'Bulk', at: '2026-10-06T10:00:00Z', prog: structuredClone(BUILTIN.B) },
      { id: 'v1', name: 'Cut', from: 'A', at: '2026-10-05T10:00:00Z', auto: true, prog: structuredClone(BUILTIN.A) },
    ];
    const back = roundTrip('library/main', { items }) as { items: { id: string }[] };
    expect(back.items.map(i => i.id)).toEqual(['v1', 'v2']);
    expect(back.items[0]).toEqual(normLibrary(items).find(i => i.id === 'v1'));
  });

  it('experiments keep their order', () => {
    const items = [{ id: 'x2', ex: 'bench', ph: 'hyp', note: '' }, { id: 'x1', ex: 'squat', ph: null, note: 'try' }];
    expect(roundTrip('experiments/main', { items })).toEqual({ schema: 1, items });
  });

  it('stretches and stretch experiments keep their order, in one document', () => {
    const doc = { items: [{ id: 's2', n: 'Reach', group: 'Standing', tier: 'secondary' }, { id: 's1', n: 'Scarecrow', group: 'Bands', tier: 'primary', url: 'https://youtu.be/x' }], experiments: [{ id: 'e1', n: 'Pigeon' }] };
    expect(roundTrip('stretches/main', doc)).toEqual(doc);
  });

  it('stretches: an emptied routine is an empty document, not "never saved"', () => {
    const m = mirrorOf(desiredRows(kind('stretches/main'), { items: [{ id: 's1', n: 'A', group: 'Other', tier: '' }], experiments: [] }, new Map()));
    const gone = new Map([...m].map(([k, r]) => [k, { ...r, deleted: true, version: 2 }]));
    expect(documentFor(kind('stretches/main'), gone as never)).toEqual({ items: [], experiments: [] });
  });

  it('supplements: days, items and the goal and mode, from three kinds of row', () => {
    const doc = {
      waterGoal: 80, waterMode: 'fixed',
      water: { '2026-10-07': [16, 8], '2026-10-08': [12] }, boost: { '2026-10-07': { hot: true, mins: 45 } },
      items: [{ id: 'zinc', n: 'Zinc', slot: 'night' }, { id: 'creatine', n: 'Creatine', slot: 'morning', dose: '5 g' }],
      taken: { '2026-10-07': { creatine: true } },
    };
    expect(roundTrip('supplements/main', doc)).toEqual(doc);
  });

  it('supplements: a fresh account saving only defaults has no config row', () => {
    const rows = desiredRows(kind('supplements/main'), { waterGoal: 64, waterMode: 'weight', water: {}, boost: {}, items: [], taken: {} }, new Map());
    expect(rows).toEqual([]);
  });

  it('config: round-trips, and the water goal and mode stay out of it', () => {
    const cfg = { mode: 2, m2Even: 'B', rest: 90, rm: { bench: 225 }, pct: { strength: 85, iso: 75, hyp: 70, exp: 45 }, ex: {} };
    expect(roundTrip('config/main', { ...cfg, backup: { repo: 'me/x', branch: 'main', hashes: {} } })).toMatchObject(cfg);
    expect(roundTrip('config/main', { ...cfg, backup: { repo: 'me/x' } })).not.toHaveProperty('backup');
    const withWater = mirrorOf([{ table: 'config', key: 'config', config: { mode: 1, waterGoal: 90, waterMode: 'fixed' } }]);
    expect(documentFor(kind('config/main'), withWater)).toEqual({ mode: 1 });
    // saving the config document keeps the server's water settings
    expect(desiredRows(kind('config/main'), { mode: 3 }, withWater)).toEqual([{ table: 'config', key: 'config', config: { mode: 3, waterGoal: 90, waterMode: 'fixed' } }]);
  });

  it('nothing in the mirror means no document', () => {
    for (const p of ['logs/squat', 'weeks/2026-10-04', 'stretchweeks/2026-10-04', 'programs/A', 'body/main', 'library/main', 'experiments/main', 'stretches/main', 'supplements/main', 'config/main']) {
      expect(documentFor(kind(p), new Map()), p).toBeNull();
    }
  });

  it('a deleted week or program has no document', () => {
    const w = new Map([[`weeks|2026-10-04`, asRow({ table: 'weeks', key: '2026-10-04', week: normWeek(null) }, { deleted: true, version: 2 })]]);
    expect(documentFor(kind('weeks/2026-10-04'), w)).toBeNull();
  });
});

describe('scope and affected paths', () => {
  it('a path owns only its own rows; the config row belongs to neither config nor supplements', () => {
    const m = mirrorOf([
      { table: 'log_entries', key: 'a', exerciseId: 'squat', entry: { d: '2026-10-05', id: 'a' } },
      { table: 'log_entries', key: 'b', exerciseId: 'bench', entry: { d: '2026-10-05', id: 'b' } },
      { table: 'config', key: 'config', config: {} },
    ]);
    expect(scopeRows(kind('logs/squat'), m).map(r => r.key)).toEqual(['a']);
    expect(scopeRows(kind('config/main'), m)).toEqual([]);
    expect(scopeRows(kind('supplements/main'), m)).toEqual([]);
  });

  it('pathsOf names the documents a row feeds', () => {
    const r = (row: Parameters<typeof asRow>[0]) => pathsOf(asRow(row));
    expect(r({ table: 'log_entries', key: 'a', exerciseId: 'squat', entry: { d: '2026-10-05' } })).toEqual(['logs/squat']);
    expect(r({ table: 'config', key: 'config', config: {} })).toEqual(['config/main', 'supplements/main']);
    expect(r({ table: 'list_items', key: 'experiment/x', list: 'experiment', position: 0, item: { id: 'x', ex: 'squat', ph: null, note: '' } })).toEqual(['experiments/main']);
    expect(r({ table: 'list_items', key: 'stretch_experiment/x', list: 'stretch_experiment', position: 0, item: { id: 'x', n: 'X' } })).toEqual(['stretches/main']);
    expect(r({ table: 'list_items', key: 'supplement_item/x', list: 'supplement_item', position: 0, item: { id: 'x', n: 'X', slot: '' } })).toEqual(['supplements/main']);
    expect(r({ table: 'supplement_days', key: '2026-10-07', day: '2026-10-07', record: { water: [], boost: null, taken: {} } })).toEqual(['supplements/main']);
    expect(r({ table: 'stretch_weeks', key: '2026-10-04', week: { done: {}, skipped: {}, extra: [] } })).toEqual(['stretchweeks/2026-10-04']);
  });
});
