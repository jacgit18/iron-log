import { afterEach, describe, expect, it, vi } from 'vitest';
import { SWITCH_MARK_KEY } from '../lib/qaSwitchWipe.js';
import { resetPersona, returnToAdmin, switchPersona } from './qaPersonas.js';

// The stamp the reload reads (lib/qaSwitchWipe.ts) is written only after a switch or Return that worked.
function stub(status: number) {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => ({}) })));
  return store;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('the switch stamp', () => {
  it('is written after a switch and after Return that worked', async () => {
    const a = stub(200);
    expect(await switchPersona('new-user')).toBe('ok');
    expect(a.get(SWITCH_MARK_KEY)).toMatch(/^\d+$/);
    const b = stub(200);
    expect(await returnToAdmin()).toBe('ok');
    expect(b.has(SWITCH_MARK_KEY)).toBe(true);
  });
  it('is not written after a refused or unreachable switch, or after Reset', async () => {
    for (const status of [403, 404, 500, 429]) {
      const s = stub(status);
      await switchPersona('new-user');
      await returnToAdmin();
      expect(s.has(SWITCH_MARK_KEY), String(status)).toBe(false);
    }
    const r = stub(200);
    expect(await resetPersona('new-user')).toBe('ok');
    expect(r.has(SWITCH_MARK_KEY)).toBe(false);
  });
  it('still switches when storage is blocked', async () => {
    stub(200);
    vi.stubGlobal('sessionStorage', { setItem: () => { throw new Error('blocked'); } });
    expect(await switchPersona('new-user')).toBe('ok');
  });
});
