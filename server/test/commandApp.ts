import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { createApp } from '../app.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from './postgres.ts';

// What the command tests (server/commands/*.test.ts) share: a throwaway database with the real migrations and the real app listening on a free
// port. `stop` closes the server, then the database.
export async function startCommandApp(): Promise<{ db: Kysely<DB>; base: string; stop: () => Promise<void> }> {
  const { db, stop: stopDb } = await startTestDatabase();
  const server: Server = createApp({ db }).listen(0);
  await new Promise(done => server.once('listening', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const stop = async () => {
    await new Promise<void>(done => server.close(() => done()));
    await stopDb?.();
  };
  return { db, base, stop };
}

// POST /api/<path> as a dev user. `base` is read when called, so a test file can declare it before the app starts.
export const makeSend = (base: () => string) => async (path: string, body: unknown, user = 'owner') => {
  const res = await fetch(`${base()}/api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-user': user, 'x-client-version': 'test-1' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
};
