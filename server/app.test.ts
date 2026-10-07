import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';

let server: Server | undefined;

afterEach(() => new Promise<void>(done => (server ? server.close(() => done()) : done())));

async function start() {
  server = createApp().listen(0);
  await new Promise(done => server!.once('listening', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('GET /api/health', () => {
  it('answers ok', async () => {
    const res = await fetch(`${await start()}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('does not advertise Express', async () => {
    const res = await fetch(`${await start()}/api/health`);
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});
