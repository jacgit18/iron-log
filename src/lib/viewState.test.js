import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadView, saveView } from './viewState.js';

const store = {};
beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
  vi.stubGlobal('sessionStorage', { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } });
});

describe('view state', () => {
  it('restores the tab and phone day on the same day', () => {
    saveView('2026-10-02', { tab: 'progress', mDay: 3 });
    expect(loadView('2026-10-02')).toEqual({ tab: 'progress', mDay: 3 });
  });
  it('drops the phone day on a later day but keeps the tab', () => {
    saveView('2026-10-02', { tab: 'daily', mDay: 3 });
    expect(loadView('2026-10-03')).toEqual({ tab: 'daily' });
  });
  it('ignores junk and missing storage', () => {
    store['ironlog-view'] = '{"tab":"nope","mDay":99,"day":"x"}';
    expect(loadView('x')).toEqual({});
    store['ironlog-view'] = 'not json';
    expect(loadView('x')).toEqual({});
    vi.stubGlobal('sessionStorage', undefined);
    expect(loadView('x')).toEqual({});
    expect(() => saveView('x', { tab: 'board', mDay: null })).not.toThrow();
  });
});
