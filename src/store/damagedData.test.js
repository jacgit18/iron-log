import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_KEY } from '../lib/gate.js';

// A value found damaged while the modules load (features.ts reads the admin flag at import) is told to the store's listener as soon as
// it subscribes. The store must be able to take it then: a throw here would stop the app loading on every launch.
describe('damaged saved data at load', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('loads the store and says so when a key read at import is damaged', async () => {
    const mem = { ['ironlog:' + ADMIN_KEY]: '{tru' };
    vi.stubGlobal('localStorage', {
      getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: k => { delete mem[k]; },
      get length() { return Object.keys(mem).length; }, key: i => Object.keys(mem)[i] ?? null,
    });
    vi.stubGlobal('document', { addEventListener: () => {}, removeEventListener: () => {} }); // flag() arms a tap listener on a timer
    vi.resetModules();
    const { useAppStore } = await import('./useAppStore.js');
    expect(useAppStore.getState().saveFlag).toBe('Could not read some saved data. A copy was kept');
    expect(mem['ironlog-damaged:' + ADMIN_KEY]).toBe('{tru');
    await new Promise(r => setTimeout(r, 0)); // let that timer run before the globals go
  });
});
