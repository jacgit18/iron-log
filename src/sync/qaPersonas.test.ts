import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPersonas, returnToAdmin, switchPersona } from './qaPersonas.js';
import { getQa, setQa } from './qaState.js';

// The three calls to the QA-only routes (brief qa-persona-picker): none throws, a failure is an answer.
const reply = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
afterEach(() => { vi.unstubAllGlobals(); setQa(undefined); });

describe('loadPersonas', () => {
  it('asks the list route with the cookie and returns the parsed list', async () => {
    const f = reply(200, { ok: true, current: null, personas: [{ id: 'founder', name: 'Founder', group: 'Plans', plan: 'founder', planStatus: null, scenario: 'a', tryThis: 'b' }] });
    vi.stubGlobal('fetch', f);
    const out = await loadPersonas();
    expect(out?.personas.map(p => p.id)).toEqual(['founder']);
    expect(f.mock.calls[0]![0]).toBe('/api/auth/qa/personas');
    expect((f.mock.calls[0]![1] as RequestInit).credentials).toBe('same-origin');
  });
  it('answers null for a refusal, an unreadable body and a network failure', async () => {
    vi.stubGlobal('fetch', reply(403));
    expect(await loadPersonas()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })));
    expect(await loadPersonas()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await loadPersonas()).toBeNull();
  });
});

describe('switchPersona and returnToAdmin', () => {
  it('post the id, or nothing, to their own routes', async () => {
    const f = reply(200);
    vi.stubGlobal('fetch', f);
    expect(await switchPersona('paid-past-due')).toBe('ok');
    expect(await returnToAdmin()).toBe('ok');
    expect(f.mock.calls[0]![0]).toBe('/api/auth/qa/personas/switch');
    expect((f.mock.calls[0]![1] as RequestInit).body).toBe(JSON.stringify({ id: 'paid-past-due' }));
    expect(f.mock.calls[1]![0]).toBe('/api/auth/qa/personas/return');
    expect((f.mock.calls[1]![1] as RequestInit).method).toBe('POST');
  });
  it('tell a refusal from a server or network problem', async () => {
    vi.stubGlobal('fetch', reply(403));
    expect(await switchPersona('x')).toBe('refused');
    vi.stubGlobal('fetch', reply(404));
    expect(await returnToAdmin()).toBe('refused');
    vi.stubGlobal('fetch', reply(500));
    expect(await switchPersona('x')).toBe('unreachable');
    vi.stubGlobal('fetch', reply(429));
    expect(await returnToAdmin()).toBe('unreachable');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await switchPersona('x')).toBe('unreachable');
  });
});

describe('qaState', () => {
  it('holds what /api/me last said, and clears it', () => {
    expect(getQa()).toBeUndefined();
    setQa({ persona: 'Founder', canSwitch: false });
    expect(getQa()).toEqual({ persona: 'Founder', canSwitch: false });
    setQa({ persona: 'Founder', canSwitch: false }); // the same answer again changes nothing
    expect(getQa()).toEqual({ persona: 'Founder', canSwitch: false });
    setQa(undefined);
    expect(getQa()).toBeUndefined();
  });
});
