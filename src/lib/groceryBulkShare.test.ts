import { describe, expect, it } from 'vitest';
import type { GroceryItem, GroceryLine, GroceryShare } from '../types.ts';
import { applyBulkShare, emptyForm, lineWithShare, packNote, restoreShareSnapshot, setNotMine, setReset, shareFromForm, sharedText, takeShareSnapshot, togglePerson, type ShareApi } from './groceryBulkShare.js';

const item = (id: string, share?: GroceryShare): GroceryItem => ({ id, n: id, store: 'Costco', qty: 1, cents: null, every: true, out: false, ...(share ? { share } : {}) });

describe('the sheet choices', () => {
  it('builds the share from the people ticked', () => {
    expect(shareFromForm(emptyForm())).toEqual({ with: [] });
    expect(shareFromForm(togglePerson(emptyForm(), 'sam', true))).toEqual({ with: ['sam'] });
    expect(shareFromForm(setNotMine(togglePerson(emptyForm(), 'sam', true), true))).toEqual({ with: ['sam'], notMine: true });
  });
  it('not mine only counts with someone ticked, and goes when the last person is unticked', () => {
    expect(setNotMine(emptyForm(), true).notMine).toBe(false);
    const f = setNotMine(togglePerson(emptyForm(), 'sam', true), true);
    expect(togglePerson(f, 'sam', false)).toEqual(emptyForm());
  });
  it('use the usual clears the share, and ticking a person leaves it', () => {
    const r = setReset(togglePerson(emptyForm(), 'sam', true), true);
    expect(r).toEqual({ people: [], notMine: false, reset: true });
    expect(shareFromForm(r)).toBeNull();
    expect(togglePerson(r, 'alex', true)).toEqual({ people: ['alex'], notMine: false, reset: false });
  });
});

describe('lineWithShare', () => {
  it('sets the share and drops the packs shares so every pack takes it', () => {
    const line: GroceryLine = { got: true, prices: [500, 700], packShares: [{ with: ['sam'] }, null] };
    expect(lineWithShare(line, { with: ['alex'] })).toEqual({ got: true, prices: [500, 700], share: { with: ['alex'] } });
  });
  it('a reset clears share and packs, and an empty line is null', () => {
    expect(lineWithShare({ share: { with: ['sam'] }, packShares: [null] }, null)).toBeNull();
    expect(lineWithShare({ got: true, share: { with: ['sam'] } }, null)).toEqual({ got: true });
    expect(lineWithShare(undefined, { with: [] })).toEqual({ share: { with: [] } });
  });
});

describe('labels', () => {
  it('names the result like the chip does', () => {
    expect(sharedText(4, { with: ['sam'] })).toBe('Shared 4 items: Me +1.');
    expect(sharedText(1, { with: [] })).toBe('Shared 1 item: Just me.');
    expect(sharedText(2, { with: ['sam'], notMine: true })).toBe('Shared 2 items: Not mine.');
    expect(sharedText(3, null)).toBe('Shared 3 items: the usual split.');
  });
  it('says so when packs are in the pick', () => {
    const lines: Record<string, GroceryLine> = { a: { prices: [1, 2] }, b: {} };
    expect(packNote(['a', 'b'], lines)).toBe('1 picked item is priced pack by pack: every pack gets this split.');
    expect(packNote(['b'], lines)).toBe('');
  });
});

const now = (lines: Record<string, GroceryLine>) => (_m: string, id: string) => lines[id];
// A fake of the three store actions: setGroceryLineShare moves the usual from this month on, as the real one does.
function fake(items: GroceryItem[], lines: Record<string, GroceryLine>, blocked = false) {
  const api: ShareApi = {
    blocked: () => blocked,
    setGroceryLineShare(_m, id, share) {
      const it = items.find(i => i.id === id); if (!it) return;
      if (share) it.share = share; else delete it.share;
      const l = { ...(lines[id] ?? {}) }; if (share) l.share = share; else delete l.share;
      if (Object.keys(l).length) lines[id] = l; else delete lines[id];
    },
    setGroceryItemShare(id, share) { const it = items.find(i => i.id === id); if (!it) return; if (share) it.share = share; else delete it.share; },
    restoreGroceryLine(_m, id, line) { if (line) lines[id] = line; else delete lines[id]; },
  };
  return api;
}

describe('apply and undo', () => {
  const setup = () => {
    const items = [item('a'), item('b', { with: ['alex'] }), item('c')];
    const lines: Record<string, GroceryLine> = { a: { got: true }, c: { prices: [500, 700], packShares: [{ with: ['sam'] }, null] } };
    return { items, lines, api: fake(items, lines) };
  };
  it('sets the lines and leaves the usual splits alone by default', () => {
    const { items, lines, api } = setup();
    const snap = takeShareSnapshot('2026-11', ['a', 'b', 'c'], lines, items);
    expect(applyBulkShare(api, () => items, snap, { with: ['sam'] }, false)).toBe(3);
    expect(lines.a).toEqual({ got: true, share: { with: ['sam'] } });
    expect(lines.c).toEqual({ prices: [500, 700], share: { with: ['sam'] } });
    expect(items.map(i => i.share ?? null)).toEqual([null, { with: ['alex'] }, null]);
  });
  it('also sets the usual split when asked', () => {
    const { items, lines, api } = setup();
    applyBulkShare(api, () => items, takeShareSnapshot('2026-11', ['a', 'b'], lines, items), { with: ['sam'] }, true);
    expect(items.map(i => i.share ?? null)).toEqual([{ with: ['sam'] }, { with: ['sam'] }, null]);
  });
  it('a reset clears the line and keeps the usual', () => {
    const { items, lines, api } = setup();
    lines.b = { share: { with: ['sam'] } };
    applyBulkShare(api, () => items, takeShareSnapshot('2026-11', ['b'], lines, items), null, true);
    expect(lines.b).toBeUndefined();
    expect(items[1]!.share).toEqual({ with: ['alex'] });
  });
  it('undo puts every line, pack share and usual split back exactly', () => {
    const { items, lines, api } = setup();
    const before = JSON.stringify({ items, lines });
    const snap = takeShareSnapshot('2026-11', ['a', 'b', 'c'], lines, items);
    applyBulkShare(api, () => items, snap, { with: ['sam'], notMine: true }, true);
    expect(JSON.stringify({ items, lines })).not.toBe(before);
    restoreShareSnapshot(snap, api, now(lines));
    expect(JSON.stringify({ items, lines })).toBe(before);
  });
  it('undo while sync is loading writes nothing and says so, then works once ready', () => {
    const { items, lines } = setup();
    const snap = takeShareSnapshot('2026-11', ['a', 'b'], lines, items);
    applyBulkShare(fake(items, lines), () => items, snap, { with: ['sam'] }, true);
    const after = JSON.stringify({ items, lines });
    expect(restoreShareSnapshot(snap, fake(items, lines, true), now(lines))).toBe(false);
    expect(JSON.stringify({ items, lines })).toBe(after);
    expect(restoreShareSnapshot(snap, fake(items, lines), now(lines))).toBe(true);
    expect(lines.a).toEqual({ got: true });
  });
  it('undo keeps a tick made after Apply and leaves an untouched usual split alone', () => {
    const { items, lines, api } = setup();
    const snap = takeShareSnapshot('2026-11', ['a'], lines, items);
    applyBulkShare(api, () => items, snap, { with: ['sam'] }, false);
    expect(Object.keys(snap.usual)).toEqual([]);
    lines.a = { ...lines.a!, cents: 450 };
    restoreShareSnapshot(snap, api, now(lines));
    expect(lines.a).toEqual({ got: true, cents: 450 });
  });
  it('skips an item that is gone', () => {
    const { items, lines, api } = setup();
    const snap = takeShareSnapshot('2026-11', ['a', 'zzz'], lines, items);
    expect(applyBulkShare(api, () => items, snap, { with: [] }, false)).toBe(1);
  });
});
