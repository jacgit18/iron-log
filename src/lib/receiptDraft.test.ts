import { describe, expect, it } from 'vitest';
import { DRAFT_KEY, DRAFT_MAX_MS, clearDraft, draftAge, isEdited, loadDraft, parseDraft, saveDraft, shouldAskOnBack, type Draft, type EditState } from './receiptDraft';

const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const line = { text: 'BANANAS', qty: 1, grossCents: 149, discountCents: 0, matchId: 'i1' };
const draft = (over: Partial<Draft> = {}): Draft => ({ savedAt: NOW - 60_000, mk: '2026-11', receipt: { store: "BJ's", lines: [line, { ...line, text: 'TOWELS', matchId: null }] }, restore: { choices: [] }, ...over });
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

describe('draft storage', () => {
  it('round-trips a draft', () => {
    const s = fake(); saveDraft(s, draft());
    expect(loadDraft(s, NOW)).toEqual(draft());
  });
  it('expires after 2 hours and removes it', () => {
    const s = fake(); saveDraft(s, draft({ savedAt: NOW - DRAFT_MAX_MS }));
    expect(loadDraft(s, NOW)).toBeNull();
    expect(s.m.has(DRAFT_KEY)).toBe(false);
    saveDraft(s, draft({ savedAt: NOW - DRAFT_MAX_MS + 1000 }));
    expect(loadDraft(s, NOW)).not.toBeNull();
  });
  it('drops text that is not a draft', () => {
    for (const raw of ['', 'nope', '[]', '{}', JSON.stringify({ ...draft(), savedAt: 'x' }), JSON.stringify({ ...draft(), mk: 'November' }), JSON.stringify({ ...draft(), receipt: { lines: [] } }), JSON.stringify({ ...draft(), receipt: { lines: [{ text: 1 }] } }), JSON.stringify({ ...draft(), restore: 5 }), JSON.stringify({ ...draft(), savedAt: NOW + 10 * 60_000 })])
      expect(parseDraft(raw, NOW)).toBeNull();
    const s = fake({ [DRAFT_KEY]: 'nope' });
    expect(loadDraft(s, NOW)).toBeNull();
    expect(s.m.has(DRAFT_KEY)).toBe(false);
  });
  it('accepts a draft saved without a restore', () => {
    const d = draft(); const raw = JSON.stringify({ savedAt: d.savedAt, mk: d.mk, receipt: d.receipt });
    expect(parseDraft(raw, NOW)?.restore).toBeNull();
  });
  it('clears, and ignores a storage that refuses', () => {
    const s = fake(); saveDraft(s, draft()); clearDraft(s);
    expect(s.m.size).toBe(0);
    const bad = fake({}, true);
    expect(() => saveDraft(bad, draft())).not.toThrow();
    expect(loadDraft(bad, NOW)).toBeNull();
    expect(() => clearDraft(bad)).not.toThrow();
  });
});

describe('draftAge', () => {
  it('says how long ago in plain words', () => {
    expect(draftAge(NOW - 20_000, NOW)).toBe('just now');
    expect(draftAge(NOW - 12 * 60_000, NOW)).toBe('12 min ago');
    expect(draftAge(NOW - 61 * 60_000, NOW)).toBe('1 hour ago');
    expect(draftAge(NOW - 119 * 60_000, NOW)).toBe('1 hour ago');
    expect(draftAge(NOW + 5000, NOW)).toBe('just now');
  });
});
