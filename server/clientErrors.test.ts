import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { scrubReport } from './clientErrors.ts';

describe('scrubReport', () => {
  const ok = { kind: 'error', message: 'Cannot read properties of undefined', stack: '', page: 'https://app.example/progress?week=2026-10-04#x', version: '1791448234' };

  it('keeps what helps and nothing personal', () => {
    const r = scrubReport({ ...ok, message: 'Bad weight 181.5 lb for jane@example.com on 2026-10-07 token ghp_abcdefghijklmnop' })!;
    expect(r.message).toBe('Bad weight ###.# lb for [email] on ####-##-## token [secret]');
    expect(r.page).toBe('/progress');
    expect(r.version).toBe('1791448234');
  });

  it('keeps only stack frames, with addresses cleaned and the message line dropped', () => {
    const r = scrubReport({ ...ok, stack: 'TypeError: weight 181 is bad\n    at foo (https://app.example/assets/index-abc.js?v=1:10:20)\n    at https://app.example/assets/index-abc.js:3:4\nsome free text with 181 in it' })!;
    expect(r.stack).toEqual(['foo /assets/index-abc.js:10:20', '/assets/index-abc.js:3:4']);
    expect(JSON.stringify(r)).not.toContain('181');
  });

  it('refuses what is not a report', () => {
    for (const body of [null, 'x', [], {}, { kind: 'nope', message: 'm' }, { kind: 'error' }, { kind: 'error', message: '  ' }, { kind: 'error', message: 5 }]) expect(scrubReport(body)).toBeNull();
  });

  it('caps every field', () => {
    const r = scrubReport({ kind: 'sync', message: 'some words '.repeat(500), stack: Array.from({ length: 100 }, (_, i) => `at f${i} (https://x.test/a.js:${i}:1)`).join('\n'), page: 'p'.repeat(5000), version: 'v'.repeat(500) })!;
    expect(r.message.length).toBe(300);
    expect(r.stack.length).toBeLessThanOrEqual(12);
    expect(r.page.length).toBeLessThanOrEqual(120);
    expect(r.version.length).toBe(20);
  });
});

describe('POST /api/client-errors', () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    server = createApp({ limits: { clientErrors: { max: 3, windowMs: 60_000 } } }).listen(0);
    await new Promise(done => server.once('listening', done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>(done => server.close(() => done())));
  const post = (body: unknown) => fetch(`${base}/api/client-errors`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

  it('logs one scrubbed line as an error, answers 204 without a sign-in, then limits the caller', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await post({ kind: 'error', message: 'weight 181 broke', page: '/progress', version: '1' })).status).toBe(204);
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual({ severity: 'ERROR', msg: 'client-error', kind: 'error', message: 'weight ### broke', stack: [], page: '/progress', version: '1' });
    expect((await post({ nope: 1 })).status).toBe(422);
    expect((await post({ kind: 'error', message: 'again' })).status).toBe(204);
    const limited = await post({ kind: 'error', message: 'too many' });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    log.mockRestore();
  });

  it('refuses a body over 4 kb', async () => {
    const res = await post({ kind: 'error', message: 'x'.repeat(6000) });
    expect([413, 429]).toContain(res.status);
  });
});
