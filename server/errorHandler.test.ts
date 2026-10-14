import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { errorHandler, isDatabaseTrouble } from './errorHandler.ts';

let server: Server | undefined;
beforeEach(() => void vi.spyOn(console, 'error').mockImplementation(() => undefined));
afterEach(() => {
  vi.restoreAllMocks();
  return new Promise<void>(done => (server ? server.close(() => done()) : done()));
});

async function listen(app: express.Express) {
  server = app.listen(0);
  await new Promise(done => server!.once('listening', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

// A route that throws whatever it is given, behind the handler.
async function throwing(err: unknown) {
  const app = express();
  app.get('/boom', () => { throw err; });
  app.get('/reject', async () => { throw err; });
  app.use(errorHandler());
  return listen(app);
}

describe('the error handler', () => {
  it('answers an unknown error with a generic JSON 500 and a request id, and leaks nothing', async () => {
    const base = await throwing(new Error('relation "secret_table" does not exist'));
    const res = await fetch(`${base}/boom`);
    expect(res.status).toBe(500);
    const body = (await res.json()) as unknown;
    expect(body).toEqual({ ok: false, error: 'something went wrong on the server', requestId: expect.any(String) });
    expect(JSON.stringify(body)).not.toMatch(/secret_table|at /);
    expect(res.headers.get('content-type')).toMatch(/json/);
  });

  it('logs one JSON line with the same request id and the real message', async () => {
    const base = await throwing(new Error('relation "secret_table" does not exist'));
    const body = (await (await fetch(`${base}/boom`)).json()) as { requestId: string };
    const line = JSON.parse(String((console.error as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]));
    expect(line).toMatchObject({ msg: 'request failed', requestId: body.requestId, status: 500, error: 'relation "secret_table" does not exist' });
  });

  it('catches a rejected async route too', async () => {
    const res = await fetch(`${await throwing(new Error('x'))}/reject`);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it('answers a database that is down or slow with 503 and Retry-After', async () => {
    for (const err of [Object.assign(new Error('x'), { code: 'ECONNREFUSED' }), Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }), new Error('timeout exceeded when trying to connect')]) {
      const res = await fetch(`${await throwing(err)}/boom`);
      expect(res.status).toBe(503);
      expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
      await new Promise<void>(done => server!.close(() => done()));
    }
  });

  it('does not take a plain Error for database trouble', () => {
    expect(isDatabaseTrouble(new Error('boom'))).toBe(false);
    expect(isDatabaseTrouble('nope')).toBe(false);
    expect(isDatabaseTrouble(Object.assign(new Error('x'), { code: '23505' }))).toBe(false);
  });
});

describe('the app', () => {
  const post = (base: string, path: string, body: string) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

  it('answers a malformed body on /api/client-errors with a JSON 400', async () => {
    const base = await listen(createApp());
    const res = await post(base, '/api/client-errors', '{not json');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it('answers an oversize body on /api/client-errors with a JSON 413', async () => {
    const base = await listen(createApp());
    const res = await post(base, '/api/client-errors', JSON.stringify({ message: 'x'.repeat(10_000) }));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ ok: false, error: 'request body too large' });
  });

  it('answers a malformed body on /api/commands with a JSON error, not a stack page', async () => {
    const base = await listen(createApp());
    const res = await post(base, '/api/commands/tick-card', '{not json');
    expect([400, 401, 503]).toContain(res.status);
    expect(res.headers.get('content-type')).toMatch(/json/);
  });
});
