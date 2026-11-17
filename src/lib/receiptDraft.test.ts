import { describe, expect, it, vi } from 'vitest';
import { DRAFTS_KEY, DRAFT_MAX_MS, LEGACY_KEY, MAX_DRAFTS, clearAllDrafts, clearDraft, draftAge, dropAllDrafts, dropDraft, isEdited, keepDraft, loadDrafts, migrateLegacy, parseDrafts, readDrafts, relinkDraft, removeDraft, saveDraft, shouldAskOnBack, upsertDraft, type Draft, type EditState } from './receiptDraft';

const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const line = { text: 'BANANAS', qty: 1, grossCents: 149, discountCents: 0, matchId: 'i1' };
const draft = (over: Partial<Draft> = {}): Draft => ({ id: 'a', savedAt: NOW - 60_000, mk: '2026-11', receipt: { store: "BJ's", lines: [line, { ...line, text: 'TOWELS', matchId: null }] }, restore: { choices: [] }, ...over });
const fake = (init: Record<string, string> = {}, fail = false) => {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k: string) => (fail ? (() => { throw new Error('blocked'); })() : m.get(k) ?? null), setItem: (k: string, v: string) => { if (fail) throw new Error('full'); m.set(k, v); }, removeItem: (k: string) => { if (fail) throw new Error('blocked'); m.delete(k); } };
};
const base = (over: Partial<EditState> = {}): EditState => ({
  choices: [{ itemId: 'i1', include: true }, { itemId: null, include: false }], initial: [{ itemId: 'i1', include: true }, { itemId: null, include: false }],
  renames: 0, touched: 0, noRemember: 0, separate: 0, staged: 0, unticked: 0, keep: false, formOpen: false, storePicked: false, shared: false, ...over,
});

describe('isEdited', () => {
  it('is false for a sheet as the scan opened it', () => expect(isEdited(base())).toBe(false));
  it('sees a ticked or unticked line and a changed match', () => {
    expect(isEdited(base({ choices: [{ itemId: 'i1', include: false }, { itemId: null, include: false }] }))).toBe(true);
    expect(isEdited(base({ choices: [{ itemId: 'i2', include: true }, { itemId: null, include: false }] }))).toBe(true);
  });
  it('sees a rename, a typed name, a split row, an added item, an open form, Keep photo and the other sheet choices', () => {
    for (const o of [{ renames: 1 }, { touched: 1 }, { noRemember: 1 }, { separate: 1 }, { staged: 1 }, { unticked: 1 }, { keep: true }, { formOpen: true }, { storePicked: true }, { shared: true }]) expect(isEdited(base(o))).toBe(true);
  });
  it('treats a different number of choices as a change', () => expect(isEdited(base({ choices: [] }))).toBe(true));
});

describe('shouldAskOnBack', () => {
  it('holds the sheet open with edits, and while the prompt shows; closes an untouched sheet', () => {
    expect(shouldAskOnBack(true, false)).toBe(true);
    expect(shouldAskOnBack(false, true)).toBe(true);
    expect(shouldAskOnBack(false, false)).toBe(false);
  });
});

const raw = (...ds: unknown[]) => JSON.stringify(ds);
const DAY = 24 * 60 * 60 * 1000;

describe('draft list storage', () => {
  it('round-trips a draft', () => {
    const s = fake(); expect(saveDraft(s, draft(), NOW)).toBe(true);
    expect(loadDrafts(s, NOW)).toEqual([draft()]);
  });
  it('keeps two receipts as two drafts, newest first, and replaces one by its id', () => {
    const s = fake();
    saveDraft(s, draft({ id: 'a', savedAt: NOW - 5000 }), NOW); saveDraft(s, draft({ id: 'b', savedAt: NOW - 1000 }), NOW);
    expect(loadDrafts(s, NOW).map(d => d.id)).toEqual(['b', 'a']);
    saveDraft(s, draft({ id: 'a', savedAt: NOW }), NOW);
    expect(loadDrafts(s, NOW).map(d => d.id)).toEqual(['a', 'b']);
  });
  it('drops the oldest at the sixth', () => {
    let list: Draft[] = [];
    for (let i = 0; i < 6; i++) list = upsertDraft(list, draft({ id: `d${i}`, savedAt: NOW - (10 - i) * 1000 }));
    expect(list).toHaveLength(MAX_DRAFTS);
    expect(list.map(d => d.id)).toEqual(['d5', 'd4', 'd3', 'd2', 'd1']);
  });
  it('expires a draft after 7 days, keeps one a moment younger, and removes the expired from storage', () => {
    const s = fake(); s.m.set(DRAFTS_KEY, raw(draft({ id: 'old', savedAt: NOW - DRAFT_MAX_MS }), draft({ id: 'new', savedAt: NOW - DRAFT_MAX_MS + 1000 })));
    expect(loadDrafts(s, NOW).map(d => d.id)).toEqual(['new']);
    expect(JSON.parse(s.m.get(DRAFTS_KEY)!)).toHaveLength(1);
    expect(loadDrafts(s, NOW + 2000)).toEqual([]);
    expect(s.m.has(DRAFTS_KEY)).toBe(false);
  });
  it('drops a bad draft on its own and keeps the good one', () => {
    const bad = [5, null, 'x', {}, { ...draft(), savedAt: 'x' }, { ...draft(), id: 7 }, { ...draft(), id: '' }, { ...draft(), mk: 'November' }, { ...draft(), receipt: { lines: [] } }, { ...draft(), receipt: { lines: [{ text: 1 }] } }, { ...draft(), restore: 5 }, { ...draft(), savedAt: NOW + 10 * 60_000 }];
    for (const b of bad) expect(parseDrafts(raw(b, draft({ id: 'ok' })), NOW).map(d => d.id)).toEqual(['ok']);
  });
  it('never crashes on text that is not a list', () => {
    for (const r of ['', 'nope', '{}', '5', 'null', '"x"', JSON.stringify(draft())]) expect(parseDrafts(r, NOW)).toEqual([]);
    expect(parseDrafts(null, NOW)).toEqual([]);
    const s = fake({ [DRAFTS_KEY]: 'nope' });
    expect(loadDrafts(s, NOW)).toEqual([]);
    expect(s.m.has(DRAFTS_KEY)).toBe(false);
  });
  it('caps a stored list at five and drops a repeated id', () => {
    const many = Array.from({ length: 8 }, (_, i) => draft({ id: `d${i}`, savedAt: NOW - i * 1000 }));
    expect(parseDrafts(raw(...many), NOW)).toHaveLength(5);
    expect(parseDrafts(raw(draft(), draft()), NOW)).toHaveLength(1);
  });
  it('drops edits the sheet could not read but keeps the receipt, and rejects a receipt with odd fields', () => {
    for (const restore of [{ touched: 5 }, { choices: [{ itemId: 1, include: true }] }, { staged: [{ id: 1 }] }, { shareChoices: { rows: 3 } }, { usual: 'yes' }, { seq: 'x' }, { rewards: 5 }, { rewards: null }])
      expect(parseDrafts(raw({ ...draft(), restore }), NOW)[0]).toMatchObject({ restore: null, mk: '2026-11' });
    expect(parseDrafts(raw({ ...draft(), restore: { touched: ['a'], unticked: ['b'], usual: null, shareChoices: { whole: null, rows: {} } } }), NOW)[0]?.restore).not.toBeNull();
    expect(parseDrafts(raw({ ...draft(), restore: { rewards: '12.50' } }), NOW)[0]?.restore).toEqual({ rewards: '12.50' }); // brief receipt-rewards-credit: the typed amount restores
    const r = draft().receipt;
    for (const bad of [{ ...r, date: 20260924 }, { ...r, store: 5 }, { ...r, taxCents: 'x' }, { ...r, totalCents: null }])
      expect(parseDrafts(raw({ ...draft(), receipt: bad }), NOW)).toEqual([]);
  });
  it('accepts a draft saved without a restore', () => {
    const d = draft();
    expect(parseDrafts(raw({ id: d.id, savedAt: d.savedAt, mk: d.mk, receipt: d.receipt }), NOW)[0]?.restore).toBeNull();
  });
  it('clears one by id, then all, and ignores a storage that refuses', () => {
    const s = fake(); saveDraft(s, draft({ id: 'a' }), NOW); saveDraft(s, draft({ id: 'b' }), NOW);
    clearDraft(s, 'a', NOW);
    expect(loadDrafts(s, NOW).map(d => d.id)).toEqual(['b']);
    clearDraft(s, 'b', NOW);
    expect(s.m.has(DRAFTS_KEY)).toBe(false);
    saveDraft(s, draft(), NOW); clearAllDrafts(s);
    expect(s.m.size).toBe(0);
    const bad = fake({}, true);
    expect(saveDraft(bad, draft(), NOW)).toBe(false);
    expect(loadDrafts(bad, NOW)).toEqual([]);
    expect(() => { clearDraft(bad, 'a', NOW); clearAllDrafts(bad); }).not.toThrow();
  });
  it('removeDraft only takes the named one', () => expect(removeDraft([draft({ id: 'a' }), draft({ id: 'b' })], 'a').map(d => d.id)).toEqual(['b']));
});

describe('the old session draft', () => {
  const legacy = { savedAt: NOW - 60_000, mk: '2026-11', receipt: draft().receipt, restore: null };
  it('is moved into the list once and its key removed', () => {
    const ses = fake({ [LEGACY_KEY]: JSON.stringify(legacy) }), loc = fake();
    migrateLegacy(ses, loc, NOW);
    expect(ses.m.has(LEGACY_KEY)).toBe(false);
    const list = loadDrafts(loc, NOW);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBeTruthy();
    migrateLegacy(ses, loc, NOW);
    expect(loadDrafts(loc, NOW)).toHaveLength(1);
  });
  it('is removed without a new draft when it is junk or expired', () => {
    for (const r of ['nope', JSON.stringify({ ...legacy, savedAt: NOW - 8 * DAY }), '[]']) {
      const ses = fake({ [LEGACY_KEY]: r }), loc = fake();
      migrateLegacy(ses, loc, NOW);
      expect(ses.m.has(LEGACY_KEY)).toBe(false);
      expect(loc.m.has(DRAFTS_KEY)).toBe(false);
    }
  });
  it('stays where it is when the list cannot be written, so nothing is lost', () => {
    const ses = fake({ [LEGACY_KEY]: JSON.stringify(legacy) });
    migrateLegacy(ses, fake({}, true), NOW);
    expect(ses.m.has(LEGACY_KEY)).toBe(true);
  });
});

describe('the device calls', () => {
  it('keep, read and drop on localStorage, move the old session draft, and do nothing without storage', () => {
    const loc = fake(), ses = fake({ [LEGACY_KEY]: JSON.stringify({ savedAt: Date.now(), mk: '2026-11', receipt: draft().receipt, restore: null }) });
    vi.stubGlobal('localStorage', loc); vi.stubGlobal('sessionStorage', ses);
    expect(keepDraft(draft({ savedAt: Date.now() }))).toBe(true);
    expect(readDrafts(Date.now())).toHaveLength(2); // the kept one and the moved old one
    expect(ses.m.has(LEGACY_KEY)).toBe(false);
    dropDraft('a');
    expect(readDrafts(Date.now())).toHaveLength(1);
    dropAllDrafts();
    expect(readDrafts(Date.now())).toEqual([]);
    vi.stubGlobal('localStorage', undefined);
    expect(() => { keepDraft(draft()); dropDraft('a'); dropAllDrafts(); }).not.toThrow();
    expect(keepDraft(draft())).toBe(false);
    expect(readDrafts(Date.now())).toEqual([]);
    vi.unstubAllGlobals();
  });
  it('dropAllDrafts also removes a leftover old session draft', () => {
    const ses = fake({ [LEGACY_KEY]: 'x' });
    vi.stubGlobal('localStorage', fake()); vi.stubGlobal('sessionStorage', ses);
    dropAllDrafts();
    expect(ses.m.has(LEGACY_KEY)).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('relinkDraft', () => {
  const items = new Set(['i1', 'i2']);
  const two = (over: Partial<Draft> = {}) => draft({ receipt: { lines: [{ ...line, matchId: 'i1' }, { ...line, text: 'OIL', matchId: 'i9' }] }, ...over });
  it('changes nothing when every item is still there', () => {
    const d = two({ receipt: { lines: [{ ...line, matchId: 'i1' }, { ...line, matchId: 'i2' }] } });
    expect(relinkDraft(d, items)).toEqual({ receipt: d.receipt, restore: d.restore, n: 0 });
  });
  it('turns the match of a deleted item into no match when there are no saved edits', () => {
    const r = relinkDraft(two({ restore: null }), items);
    expect(r.n).toBe(1);
    expect(r.receipt.lines.map(l => l.matchId)).toEqual(['i1', null]);
  });
  it('turns a saved choice of a deleted item into no match, unticked, and keeps the rest', () => {
    const d = two({ restore: { choices: [{ itemId: 'i1', include: true }, { itemId: 'i9', include: true }], renames: { i1: 'Eggs' } } });
    const r = relinkDraft(d, items);
    expect(r.n).toBe(1);
    expect(r.restore).toEqual({ choices: [{ itemId: 'i1', include: true }, { itemId: null, include: false }], renames: { i1: 'Eggs' } });
    expect(d.restore!.choices).toEqual([{ itemId: 'i1', include: true }, { itemId: 'i9', include: true }]); // the stored draft is not mutated
  });
  it('keeps a staged new item, and a choice already on no match', () => {
    const d = two({ restore: { choices: [{ itemId: 'new:1', include: true }, { itemId: null, include: false }], staged: [{ id: 'new:1', n: 'X', store: '', qty: 1, cents: null }] } });
    expect(relinkDraft(d, items).n).toBe(0);
  });
  it('reads the receipt when the saved choices do not fit its lines', () => {
    const r = relinkDraft(two({ restore: { choices: [{ itemId: 'i9', include: true }] } }), items);
    expect(r.n).toBe(1);
    expect(r.receipt.lines[1]!.matchId).toBeNull();
  });
});

describe('draftAge', () => {
  it('says how long ago in plain words', () => {
    expect(draftAge(NOW - 20_000, NOW)).toBe('just now');
    expect(draftAge(NOW - 12 * 60_000, NOW)).toBe('12 min ago');
    expect(draftAge(NOW - 61 * 60_000, NOW)).toBe('1 hour ago');
    expect(draftAge(NOW - 23 * 60 * 60_000, NOW)).toBe('23 hours ago');
    expect(draftAge(NOW - 25 * 60 * 60_000, NOW)).toBe('1 day ago');
    expect(draftAge(NOW - 3 * DAY, NOW)).toBe('3 days ago');
    expect(draftAge(NOW + 5000, NOW)).toBe('just now');
  });
});
