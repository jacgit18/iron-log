import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadUsage } from './usageAdminClient.js';

// The admin Usage screen's call: every answer comes back as a plain result, never a throw.
const overview = { ok: true, installs: 2, days: [{ day: '2026-10-28', installs: 2, fromApp: 1 }], retention: [{ after: 1, eligible: 1, returned: 1 }], features: [{ version: '11', event: 'app_open', total: 3 }] };
const answer = (status: number, body?: unknown) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new Error('no body'); return body; } })));
afterEach(() => vi.unstubAllGlobals());

describe('loadUsage', () => {
  it('asks for the number of days and returns the overview', async () => {
    answer(200, overview);
    const r = await loadUsage(30);
    expect(r).toMatchObject({ ok: true, installs: 2, days: overview.days, retention: overview.retention, features: overview.features });
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe('/api/usage-admin?days=30');
  });

  it('says forbidden for 403, failed for another error status, and offline when the request throws', async () => {
    answer(403, { ok: false });
    expect(await loadUsage(30)).toEqual({ ok: false, reason: 'forbidden' });
    answer(500, { ok: false });
    expect(await loadUsage(30)).toEqual({ ok: false, reason: 'failed' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await loadUsage(30)).toEqual({ ok: false, reason: 'offline' });
  });

  it('says failed when the answer is not the expected shape or not JSON', async () => {
    answer(200, { ok: true, installs: 'x' });
    expect(await loadUsage(30)).toEqual({ ok: false, reason: 'failed' });
    answer(200);
    expect(await loadUsage(30)).toEqual({ ok: false, reason: 'failed' });
  });
});
