import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import type { DB } from './db/types.ts';

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

describe('GET /api/health/db', () => {
  // A database that only counts how many times it was asked.
  function countingDb() {
    const calls = { n: 0 };
    class Counting extends DummyDriver {
      override async acquireConnection() { calls.n++; return super.acquireConnection(); }
    }
    const db = new Kysely<DB>({ dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => new Counting(), createIntrospector: d => new PostgresIntrospector(d), createQueryCompiler: () => new PostgresQueryCompiler() } });
    return { db, calls };
  }

  it('reuses its answer for a few seconds, so repeated calls cost one query', async () => {
    const { db, calls } = countingDb();
    server = createApp({ db }).listen(0);
    await new Promise(done => server!.once('listening', done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (let i = 0; i < 5; i++) expect((await fetch(`${base}/api/health/db`)).status).toBe(200);
    expect(calls.n).toBe(1);
  });

  it('is limited per address, with Retry-After', async () => {
    server = createApp({ limits: { healthDb: { max: 2, windowMs: 60_000 } } }).listen(0);
    await new Promise(done => server!.once('listening', done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect((await fetch(`${base}/api/health/db`)).status).toBe(503);
    expect((await fetch(`${base}/api/health/db`)).status).toBe(503);
    const limited = await fetch(`${base}/api/health/db`);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).not.toBeNull();
  });
});
