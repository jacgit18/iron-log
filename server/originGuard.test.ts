import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';

// No database: a request the guard lets through reaches the sign-in step and gets 503, a refused one gets 403.
let server: Server;
let base: string;
let host: string;
beforeAll(async () => {
  server = createApp({ allowedOrigins: ['https://iron.example'] }).listen(0);
  await new Promise(done => server.once('listening', done));
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  base = `http://${host}`;
});
afterAll(() => new Promise<void>(done => server.close(() => done())));

const send = (method: string, origin?: string) => fetch(`${base}/api/commands/log-session`, { method, headers: origin === undefined ? {} : { origin } });

describe('originGuard', () => {
  it('refuses a state-changing request from another origin', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await send(method, 'https://evil.example');
      expect(res.status, method).toBe(403);
      expect(await res.json()).toEqual({ ok: false, error: 'cross-origin request refused' });
    }
  });

  it('refuses an Origin of "null" or one that is not a URL', async () => {
    expect((await send('POST', 'null')).status).toBe(403);
    expect((await send('POST', 'not a url')).status).toBe(403);
  });

  it('refuses the same host name on another port', async () => {
    expect((await send('POST', `http://127.0.0.1:${Number(host.split(':')[1]) + 1}`)).status).toBe(403);
  });

  it('lets through this server\'s own origin, a configured origin, and a request with no Origin', async () => {
    expect((await send('POST', base)).status).toBe(503);
    expect((await send('POST', 'https://iron.example')).status).toBe(503);
    expect((await send('POST')).status).toBe(503);
  });

  it('does not judge reads', async () => {
    expect((await send('GET', 'https://evil.example')).status).toBe(503);
    expect((await send('OPTIONS', 'https://evil.example')).status).not.toBe(403);
  });

  it('answers before reading the body', async () => {
    const res = await fetch(`${base}/api/commands/log-session`, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{not json' });
    expect(res.status).toBe(403);
  });
});
