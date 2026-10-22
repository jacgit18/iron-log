import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVER_MAX_BYTES, fetchServerBackup, listServerBackups, packFile, uploadBackup, uploadKey } from './serverBackups.js';

// The phone's side of server backup history (ADR 066): what is sent, how an answer is read, and the fallback when the browser cannot gzip.
afterEach(() => { vi.unstubAllGlobals(); });
const answer = (status: number, body: unknown = {}) => vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));

describe('packFile', () => {
  it('gzips when the browser can, and the result is smaller for repetitive text', async () => {
    const text = JSON.stringify({ app: 'iron-log', rows: Array.from({ length: 200 }, () => 'squat 225x5') });
    const { body, encoding } = await packFile(text);
    expect(encoding).toBe('gzip');
    expect(body[0]).toBe(0x1f); expect(body[1]).toBe(0x8b); // the gzip magic number
    expect(body.length).toBeLessThan(text.length);
  });
  it('sends the plain text when there is no CompressionStream', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const { body, encoding } = await packFile('{"app":"iron-log"}');
    expect(encoding).toBe('identity');
    expect(new TextDecoder().decode(body)).toBe('{"app":"iron-log"}');
  });
});

describe('uploadBackup', () => {
  it('PUTs the day with the counts, the encoding and the client version', async () => {
    const fetchMock = answer(200, { ok: true, saved: true }); vi.stubGlobal('fetch', fetchMock);
    expect(await uploadBackup('2026-10-22', '{"app":"iron-log"}', 12, 30)).toBe('saved');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/backups/2026-10-22');
    expect(init.method).toBe('PUT');
    expect(init.headers).toMatchObject({ 'content-type': 'application/octet-stream', 'x-backup-entries': '12', 'x-backup-score': '30', 'x-backup-encoding': 'gzip' });
    expect((init.headers as Record<string, string>)['x-client-version']).toBeTruthy();
  });
  it.each([
    [200, { ok: true, saved: false }, 'kept'],
    [401, {}, 'signed-out'], [403, {}, 'signed-out'],
    [503, {}, 'off'],
    [413, {}, 'refused'], [422, {}, 'refused'],
    [429, {}, 'failed'], [500, {}, 'failed'], [426, {}, 'failed'],
  ] as const)('status %i reads as %s', async (status, body, expected) => {
    vi.stubGlobal('fetch', answer(status, body));
    expect(await uploadBackup('2026-10-22', '{"app":"iron-log"}', 1, 1)).toBe(expected);
  });
  it('a network failure is offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await uploadBackup('2026-10-22', '{"app":"iron-log"}', 1, 1)).toBe('offline');
  });
  it('a file that stays over the cap after gzip is not sent', async () => {
    const fetchMock = answer(200); vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('CompressionStream', undefined); // plain text, so the size is the text size
    expect(await uploadBackup('2026-10-22', 'x'.repeat(SERVER_MAX_BYTES + 1), 1, 1)).toBe('refused');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('listServerBackups and fetchServerBackup', () => {
  it('reads the days and the plan window', async () => {
    vi.stubGlobal('fetch', answer(200, { ok: true, days: 30, backups: [{ date: '2026-10-22', savedAt: '2026-10-22T10:00:00.000Z', entries: 4, score: 9 }] }));
    expect(await listServerBackups()).toEqual({ ok: true, days: 30, backups: [expect.objectContaining({ date: '2026-10-22' })] });
  });
  it('says why it could not', async () => {
    vi.stubGlobal('fetch', answer(401)); expect(await listServerBackups()).toEqual({ ok: false, reason: 'signed-out' });
    vi.stubGlobal('fetch', answer(503)); expect(await listServerBackups()).toEqual({ ok: false, reason: 'off' });
    vi.stubGlobal('fetch', answer(500)); expect(await listServerBackups()).toEqual({ ok: false, reason: 'failed' });
    vi.stubGlobal('fetch', answer(200, { ok: true })); expect(await listServerBackups()).toEqual({ ok: false, reason: 'failed' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); })); expect(await listServerBackups()).toEqual({ ok: false, reason: 'offline' });
  });
  it('fetches one day as text, or null', async () => {
    vi.stubGlobal('fetch', answer(200, '{"app":"iron-log"}')); expect(await fetchServerBackup('2026-10-22')).toBe('{"app":"iron-log"}');
    vi.stubGlobal('fetch', answer(404)); expect(await fetchServerBackup('2026-10-22')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); })); expect(await fetchServerBackup('2026-10-22')).toBeNull();
  });
});

describe('uploadKey', () => {
  it('differs when the day, the score or the size changes', () => {
    const base = uploadKey('2026-10-22', 10, 100);
    expect(uploadKey('2026-10-22', 10, 100)).toBe(base);
    for (const other of [uploadKey('2026-10-23', 10, 100), uploadKey('2026-10-22', 11, 100), uploadKey('2026-10-22', 10, 101)]) expect(other).not.toBe(base);
  });
});
