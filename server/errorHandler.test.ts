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

  it('keeps a 4xx the error already carries, and does not log it as an ERROR', async () => {
    const res = await fetch(`${await throwing(Object.assign(new Error('Unsupported charset'), { status: 415 }))}/boom`);
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ ok: false, error: 'the request could not be understood' });
    expect(JSON.parse(String((console.error as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0])).severity).toBe('WARNING');
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
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toMatch(/json/);
  });

  // Code audit S-04: a request the database cannot store is the sender's mistake: 422, no 5xx alert, no row in the issue store.
  it.each([['22021', 'invalid byte sequence for encoding "UTF8": 0x00'], ['22P05', 'unsupported Unicode escape sequence'], ['54001', 'stack depth limit exceeded']])('answers a database data error %s with a 422, not a 500', async (code, message) => {
    const recorded: unknown[] = [];
    const app = express();
    app.get('/boom', () => { throw Object.assign(new Error(message), { code }); });
    app.use(errorHandler(issue => void recorded.push(issue)));
    const base = await listen(app);
    const res = await fetch(`${base}/boom`);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, error: 'the request could not be understood', requestId: expect.any(String) });
    expect(recorded).toEqual([]);
  });

  it('answers JSON nested too deep for the stack (a RangeError) with a 422', async () => {
    let deep: unknown = 1;
    for (let i = 0; i < 20000; i++) deep = { a: deep };
    let err: unknown;
    try { JSON.stringify(deep); } catch (e) { err = e; }
    // Node 26's JSON.stringify no longer overflows the stack (the request-depth limit in wellFormed.ts covers it there), but Node 22 still does and engines allows it,
    // so where the real overflow does not happen the same error is built by hand: the handler must answer it with a 422 on either.
    err ??= Object.assign(new RangeError('Maximum call stack size exceeded'), { stack: 'RangeError: Maximum call stack size exceeded\n    at JSON.stringify (<anonymous>)' });
    expect(err).toBeInstanceOf(RangeError);
    const base = await throwing(err as Error);
    expect((await fetch(`${base}/boom`)).status).toBe(422);
  });

  // Review of PR 409 (P-02): a server fault must stay a 500, so the phone pauses and retries instead of marking the write refused for good.
  // A check violation is the same: it means the app's own rule and the column disagree, and the 5xx alert is how that gets found (body weight 0.00001,
  // fixed at its source in validBodyLb). A value the app lets through is a server gap to fix there, not a sender's mistake to hide.
  it('keeps a division by zero (22012), a number out of range (22003), a check violation (23514) and a recursion bug on the server at 500', async () => {
    for (const err of [Object.assign(new Error('division by zero'), { code: '22012' }), Object.assign(new Error('value out of range'), { code: '22003' }), Object.assign(new Error('violates check constraint'), { code: '23514' }), new RangeError('Maximum call stack size exceeded')]) {
      const base = await throwing(err);
      expect((await fetch(`${base}/boom`)).status).toBe(500);
      await new Promise<void>(done => server!.close(() => done()));
    }
  });

  it('still answers a unique violation or a lost connection as before (500 and 503)', async () => {
    const unique = await throwing(Object.assign(new Error('duplicate key'), { code: '23505' }));
    expect((await fetch(`${unique}/boom`)).status).toBe(500);
    await new Promise<void>(done => server!.close(() => done()));
    const gone = await throwing(Object.assign(new Error('connection terminated'), { code: '08006' }));
    expect((await fetch(`${gone}/boom`)).status).toBe(503);
  });
});
