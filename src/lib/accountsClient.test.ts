import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteAccount, listAccounts, setSuspendedState } from './accountsClient.js';

// The admin accounts screen's calls: every failure is a plain reason, never a throw (brief admin-accounts-screen).
const reply = (status: number, body?: unknown) => vi.fn(async (_url: string, _init?: RequestInit) => new Response(body === undefined ? null : JSON.stringify(body), { status }));
afterEach(() => vi.unstubAllGlobals());

describe('listAccounts', () => {
  it('returns the overview, with a missing cap as null', async () => {
    const f = reply(200, { ok: true, cap: 25, counts: { total: 3, paid: 1, suspended: 0 }, accounts: [], actions: [] });
    vi.stubGlobal('fetch', f);
    const r = await listAccounts();
    expect(r).toEqual({ ok: true, overview: { cap: 25, counts: { total: 3, paid: 1, suspended: 0 }, accounts: [], actions: [] } });
    expect(f.mock.calls[0]![0]).toBe('/api/accounts');
    vi.stubGlobal('fetch', reply(200, { ok: true, counts: { total: 1, paid: 0, suspended: 0 }, accounts: [], actions: [] }));
    expect(await listAccounts()).toMatchObject({ ok: true, overview: { cap: null } });
  });
  it('says forbidden, failed, offline and failed again for an answer that is not the overview', async () => {
    vi.stubGlobal('fetch', reply(403, { ok: false }));
    expect(await listAccounts()).toEqual({ ok: false, reason: 'forbidden' });
    vi.stubGlobal('fetch', reply(500));
    expect(await listAccounts()).toEqual({ ok: false, reason: 'failed' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    expect(await listAccounts()).toEqual({ ok: false, reason: 'offline' });
    vi.stubGlobal('fetch', reply(200, { ok: true }));
    expect(await listAccounts()).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('setSuspendedState', () => {
  it('posts to suspend or restore the encoded account number', async () => {
    const f = reply(200, { ok: true, changed: true });
    vi.stubGlobal('fetch', f);
    expect(await setSuspendedState('15', true)).toEqual({ ok: true });
    expect(await setSuspendedState('15', false)).toEqual({ ok: true });
    expect(f.mock.calls.map(c => [c[0], c[1]?.method])).toEqual([['/api/accounts/15/suspend', 'POST'], ['/api/accounts/15/restore', 'POST']]);
  });
  it('names a refused admin target and a missing account', async () => {
    vi.stubGlobal('fetch', reply(422, { ok: false }));
    expect(await setSuspendedState('1', true)).toEqual({ ok: false, reason: 'refused' });
    vi.stubGlobal('fetch', reply(404, { ok: false }));
    expect(await setSuspendedState('9', true)).toEqual({ ok: false, reason: 'gone' });
  });
});

describe('deleteAccount', () => {
  it('posts the account number as the confirmation', async () => {
    const f = reply(200, { ok: true });
    vi.stubGlobal('fetch', f);
    expect(await deleteAccount('15')).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('/api/accounts/15/delete');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ confirm: '15' });
  });
  it('names a refusal, a missing account and a Stripe failure', async () => {
    vi.stubGlobal('fetch', reply(422, { ok: false }));
    expect(await deleteAccount('15')).toEqual({ ok: false, reason: 'refused' });
    vi.stubGlobal('fetch', reply(404, { ok: false }));
    expect(await deleteAccount('15')).toEqual({ ok: false, reason: 'gone' });
    vi.stubGlobal('fetch', reply(503, { ok: false }));
    expect(await deleteAccount('15')).toEqual({ ok: false, reason: 'unavailable' });
  });
});
