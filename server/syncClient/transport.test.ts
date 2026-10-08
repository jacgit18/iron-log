import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTransport } from '../../src/sync/transport.ts';

// The sync client's transport (src/sync/transport.ts) against a real HTTP server on a free port that answers what each test
// scripts, so the real fetch, headers, timeouts and status handling run. It lives in server/ because it needs Node's http module.
interface Seen { method: string; url: string; headers: IncomingMessage['headers']; body: string }
let server: Server;
let base: string;
let seen: Seen[];
let answer: (req: IncomingMessage, res: ServerResponse) => void;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      answer(req, res);
    });
  }).listen(0);
  await new Promise(done => server.once('listening', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(done => server.close(() => done())));
beforeEach(() => { seen = []; });

const reply = (status: number, body?: unknown, headers: Record<string, string> = {}) => {
  answer = (_req, res) => {
    res.writeHead(status, { 'content-type': typeof body === 'string' ? 'text/html' : 'application/json', ...headers });
    res.end(typeof body === 'string' ? body : body === undefined ? '' : JSON.stringify(body));
  };
};
const transport = (over: object = {}) => createTransport({ clientVersion: 'test-9', baseUrl: base, timeoutMs: 2000, ...over });
const env = { clientId: 'L1', baseVersion: null, input: { exerciseId: 'squat', entry: { d: '2026-10-05' } } };
const row = { id: '1', version: 1, seq: '5', deleted_at: null };

describe('command: what is sent', () => {
  it('posts the envelope to /api/commands/<name> with the client version', async () => {
    reply(201, { rows: [row], cursor: '5' });
    await transport().command('log-session', env);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/api/commands/log-session' });
    expect(seen[0]!.headers['content-type']).toBe('application/json');
    expect(seen[0]!.headers['x-client-version']).toBe('test-9');
    expect(JSON.parse(seen[0]!.body)).toEqual(env);
  });

  it('adds the sign-in headers, read again for every request', async () => {
    reply(201, { rows: [row], cursor: '5' });
    let n = 0;
    const t = transport({ headers: async () => ({ 'x-dev-user': `owner${++n}` }) });
    await t.command('log-session', env);
    await t.pull('0');
    expect(seen.map(s => s.headers['x-dev-user'])).toEqual(['owner1', 'owner2']);
  });
});

describe('command: what comes back', () => {
  it.each([200, 201])('a %i is a success with the rows and cursor', async status => {
    reply(status, { rows: [row], cursor: '5' });
    expect(await transport().command('log-session', env)).toEqual({ ok: true, status, rows: [row], cursor: '5' });
  });

  it.each(['stale', 'deleted', 'not-found'])('a 409 %s is a conflict that carries the current row', async reason => {
    reply(409, { refused: reason, current: reason === 'not-found' ? null : { ...row, version: 3 } });
    const out = await transport().command('log-session', { ...env, baseVersion: 1 });
    expect(out).toEqual({ ok: false, class: 'conflict', status: 409, reason, current: reason === 'not-found' ? null : { ...row, version: 3 } });
  });

  it('a 422 is refused, with the reason the server gave', async () => {
    reply(422, { refused: 'invalid-input', current: null });
    expect(await transport().command('log-session', env)).toEqual({ ok: false, class: 'refused', status: 422, reason: 'invalid-input' });
  });

  it.each([[400, { ok: false, error: 'bad json' }, 'bad json'], [413, undefined, 'status 413']])('a %i is refused too', async (status, body, reason) => {
    reply(status, body);
    expect(await transport().command('log-session', env)).toMatchObject({ ok: false, class: 'refused', status, reason });
  });

  it.each([401, 403])('a %i means sign in again: wait, never discard', async status => {
    reply(status, { ok: false, error: 'sign-in required' });
    expect(await transport().command('log-session', env)).toMatchObject({ ok: false, class: 'auth', status });
  });

  it('a 426 means the app is too old: wait, never discard', async () => {
    reply(426, { ok: false });
    expect(await transport().command('log-session', env)).toMatchObject({ ok: false, class: 'outdated', status: 426 });
  });

  it.each([500, 502, 503, 504, 429, 404, 405])('a %i is the server or its host: wait, never discard', async status => {
    reply(status, 'Bad gateway');
    expect(await transport().command('log-session', env)).toMatchObject({ ok: false, class: 'server', status });
  });

  it('a success that is not what the API sends (a proxy page, a half deploy) is a server problem, not a save', async () => {
    reply(200, '<html>Welcome to the captive portal</html>');
    expect(await transport().command('log-session', env)).toMatchObject({ ok: false, class: 'server', message: 'unexpected answer' });
    reply(200, { rows: [row] });
    expect(await transport().command('log-session', env)).toMatchObject({ ok: false, class: 'server' });
  });

  it('a 409 with no readable body is still a conflict, treated as stale', async () => {
    reply(409, '<html>conflict</html>');
    expect(await transport().command('log-session', env)).toEqual({ ok: false, class: 'conflict', status: 409, reason: 'stale', current: null });
  });

  it('passes on how long the server asked us to wait', async () => {
    reply(503, undefined, { 'retry-after': '12' });
    expect(await transport().command('log-session', env)).toMatchObject({ class: 'server', retryAfterMs: 12_000 });
    reply(401, undefined);
    expect(await transport().command('log-session', env)).toMatchObject({ class: 'auth', retryAfterMs: null });
  });
});

describe('network failures', () => {
  it('a refused connection is a network failure, not a throw', async () => {
    const out = await createTransport({ clientVersion: 'x', baseUrl: 'http://127.0.0.1:1', timeoutMs: 2000 }).command('log-session', env);
    expect(out).toMatchObject({ ok: false, class: 'network', status: 0 });
    const pulled = await createTransport({ clientVersion: 'x', baseUrl: 'http://127.0.0.1:1', timeoutMs: 2000 }).pull('0');
    expect(pulled).toMatchObject({ ok: false, class: 'network' });
  });

  it('a request that gets no answer in time is a network failure that says so', async () => {
    answer = () => { /* never answers */ };
    const out = await transport({ timeoutMs: 80 }).command('log-session', env);
    expect(out).toMatchObject({ ok: false, class: 'network', message: 'no answer in 80 ms' });
  });

  it('a fetch that throws is a network failure', async () => {
    const out = await createTransport({ clientVersion: 'x', fetch: () => Promise.reject(new TypeError('Failed to fetch')) }).command('log-session', env);
    expect(out).toMatchObject({ ok: false, class: 'network', message: 'Failed to fetch' });
  });

  it('a failing sign-in hook is not a crash either', async () => {
    reply(201, { rows: [], cursor: '1' });
    const out = await transport({ headers: () => { throw new Error('no token'); } }).command('log-session', env);
    expect(out).toMatchObject({ ok: false, class: 'network', message: 'no token' });
  });
});

describe('pull', () => {
  const page = { rows: [{ ...row, table: 'log_entries' }], cursor: '9', more: true };

  it('asks for rows after the cursor and returns the page', async () => {
    reply(200, page);
    expect(await transport().pull('4', 100)).toEqual({ ok: true, rows: page.rows, cursor: '9', more: true });
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/api/sync?since=4&limit=100' });
    expect(seen[0]!.headers['x-client-version']).toBe('test-9');
  });

  it('leaves the limit to the server when none is given', async () => {
    reply(200, { rows: [], cursor: '0', more: false });
    await transport().pull('0');
    expect(seen[0]!.url).toBe('/api/sync?since=0');
  });

  it.each([[401, 'auth'], [426, 'outdated'], [503, 'server'], [429, 'server']])('a %i is %s', async (status, cls) => {
    reply(status, { ok: false });
    expect(await transport().pull('0')).toMatchObject({ ok: false, class: cls, status });
  });

  it('a page that is not what the API sends waits instead of being applied', async () => {
    reply(200, { rows: 'nope', cursor: '1', more: false });
    expect(await transport().pull('0')).toMatchObject({ ok: false, class: 'server', message: 'unexpected answer' });
    reply(200, { rows: [], cursor: 1, more: false });
    expect(await transport().pull('0')).toMatchObject({ ok: false, class: 'server' });
    reply(400, { ok: false, error: 'since must be a whole number' });
    expect(await transport().pull('x')).toMatchObject({ ok: false, class: 'server', status: 400 });
  });
});
