import { describe, expect, it } from 'vitest';
import { afterSheetClose, navOf, onPop, opsFor, startBackNav } from './backNav';

const board = { tab: 'board', modal: false };
const daily = { tab: 'daily', modal: false };
const dailyOpen = { tab: 'daily', modal: true };

describe('navOf', () => {
  it('reads our state and ignores anything else', () => {
    expect(navOf({ nav: { tab: 'daily', modal: true } })).toEqual(dailyOpen);
    expect(navOf({ nav: { tab: 'daily' } })).toEqual(daily);
    expect(navOf(null)).toBeNull();
    expect(navOf({ settingsScreen: 'maxes' })).toBeNull();
    expect(navOf({ nav: { tab: 3 } })).toBeNull();
  });
});

describe('opsFor', () => {
  it('pushes one entry for a tab change, after cleaning the one it leaves', () => {
    expect(opsFor(board, daily, false)).toEqual([{ kind: 'replace', nav: board }, { kind: 'push', nav: daily }]);
  });
  it('does nothing when nothing changed', () => {
    expect(opsFor(daily, daily, false)).toEqual([]);
    expect(opsFor(dailyOpen, dailyOpen, true)).toEqual([]);
  });
  it('pushes an entry when a sheet opens and takes it back when it closes', () => {
    expect(opsFor(daily, dailyOpen, false)).toEqual([{ kind: 'push', nav: dailyOpen }]);
    expect(opsFor(dailyOpen, daily, true)).toEqual([{ kind: 'back' }]);
  });
  it('turns the sheet entry into the new tab when a sheet closes by choosing a tab', () => {
    expect(opsFor(dailyOpen, board, true)).toEqual([{ kind: 'replace', nav: board }]);
  });
  it('does not take back an entry that is no longer the sheet’s (Back already left it)', () => {
    expect(opsFor(dailyOpen, daily, false)).toEqual([]);
  });
});

describe('onPop', () => {
  it('goes back to the tab of the entry reached', () => {
    expect(onPop({ nav: board }, daily)).toEqual({ tab: 'board' });
  });
  it('closes an open sheet when the entry reached has none', () => {
    expect(onPop({ nav: daily }, dailyOpen)).toEqual({ closeModal: true });
  });
  it('leaves an entry that is not ours alone', () => {
    expect(onPop(null, daily)).toEqual({});
    expect(onPop({ settingsScreen: 'maxes' }, daily)).toEqual({});
  });
  it('does nothing when already there', () => {
    expect(onPop({ nav: daily }, daily)).toEqual({});
  });
});

describe('startBackNav', () => {
  // A tiny history and store: enough to see the entries it makes and what Back does to the store.
  const setup = () => {
    const entries: unknown[] = [null]; let i = 0; let pop: ((e: { state: unknown }) => void) | undefined;
    const listeners = new Set<() => void>();
    const st = { tab: 'board', modal: null as unknown, setTab(t: string) { st.tab = t; listeners.forEach(f => f()); }, closeModal() { st.modal = null; listeners.forEach(f => f()); } };
    const store = { getState: () => st, subscribe: (f: () => void) => { listeners.add(f); return () => listeners.delete(f); } };
    const history = {
      get state() { return entries[i]; },
      replaceState: (s: unknown) => { entries[i] = s; },
      pushState: (s: unknown) => { entries.length = i + 1; entries.push(s); i++; },
      back: () => { i--; pop?.({ state: entries[i] }); },
    };
    const win = { addEventListener: (_: 'popstate', f: (e: { state: unknown }) => void) => { pop = f; }, removeEventListener: () => { pop = undefined; } };
    const stop = startBackNav(store, history, win);
    return { st, history, stop, back: () => history.back(), tabEntry: () => (entries[i] as { nav: { tab: string } }).nav.tab };
  };
  it('Back walks the tabs, then stops at the first one', () => {
    const a = setup();
    a.st.setTab('daily'); a.st.setTab('progress');
    a.back(); expect(a.st.tab).toBe('daily');
    a.back(); expect(a.st.tab).toBe('board');
  });
  it('Back closes a sheet and stays on the tab; closing it another way takes its entry back', () => {
    const a = setup();
    a.st.setTab('daily'); a.st.modal = {}; a.st.setTab('daily'); // a sheet opened (the store notifies)
    a.back(); expect(a.st.modal).toBeNull(); expect(a.st.tab).toBe('daily');
    a.st.modal = {}; a.st.closeModal(); expect(a.tabEntry()).toBe('daily');
    a.back(); expect(a.st.tab).toBe('board'); // one step to the previous tab: no dead press on a sheet entry
  });
  it('stops listening when stopped', () => {
    const a = setup(); a.stop(); a.st.setTab('daily'); expect(a.tabEntry()).toBe('board');
  });
});

describe('afterSheetClose', () => {
  const win = () => { const fns = new Set<(e: { state: unknown }) => void>(); return { fns, addEventListener: (_: 'popstate', f: (e: { state: unknown }) => void) => fns.add(f), removeEventListener: (_: 'popstate', f: (e: { state: unknown }) => void) => fns.delete(f) }; };
  it('waits for the step back when the current entry is the sheet\'s own, then runs once', () => {
    const w = win(); let n = 0;
    afterSheetClose({ state: { nav: { tab: 'board', modal: true } } }, w, () => { n++; });
    expect(n).toBe(0);
    w.fns.forEach(f => f({ state: null })); w.fns.forEach(f => f({ state: null }));
    expect(n).toBe(1);
    expect(w.fns.size).toBe(0);
  });
  it('runs at once when no sheet entry is current', () => {
    const w = win(); let n = 0;
    afterSheetClose({ state: { nav: { tab: 'board', modal: false } } }, w, () => { n++; });
    afterSheetClose({ state: null }, w, () => { n++; });
    expect(n).toBe(2);
    expect(w.fns.size).toBe(0);
  });
});
