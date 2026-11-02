import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { createDb } from './db/connection.ts';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';
import { normDietEntries } from '../src/shared/diet.js';
import type { DietEntry } from '../src/types.ts';

// Diet safety checks (brief diet-safety-checks): an account backup file holding a food log, comes back from the
// server byte for byte, parses to the same entries, and a later same-day copy with a smaller score is refused. This test covers storage and the header-based guard only; the score here is a stand-in (the server may import only src/shared), and the real backupScore counting the food log is covered by src/lib/dietBackup.test.ts.
let db: Kysely<DB>;
let app: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server | undefined;
beforeAll(async () => { let appUrl: string; ({ db, stop, appUrl } = await startTestDatabase()); app = createDb(appUrl); }, 120_000);
afterAll(async () => { await app.destroy(); await stop?.(); });
afterEach(() => new Promise<void>(done => (server ? server.close(() => done()) : done())));
beforeEach(async () => { await sql`delete from backup_snapshots`.execute(db); await sql`delete from users`.execute(db); });

const TODAY = new Date().toISOString().slice(0, 10);
const entries = (n: number): DietEntry[] => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, d: TODAY, n: `Food ${i}`, kcal: 300, p: 20, c: 30, f: 8 }));
// The shape of the data file the app exports (src/lib/export.ts); the client's own export and score are covered by src/lib/dietBackup.test.ts. The score is the phone's count: one per food entry.
const fileOf = (diet: DietEntry[]) => ({ app: 'iron-log', format: 1, config: { diet: { kcal: 2900 } }, diet });
const backupScore = (file: { diet: DietEntry[] }) => file.diet.length;
const parseDataFile = (text: string) => { const d = JSON.parse(text); return { diet: normDietEntries(d.diet), config: d.config }; };

async function start() {
  server = createApp({ db: app }).listen(0);
  await new Promise(done => server!.once('listening', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = (more: Record<string, string> = {}) => ({ 'x-dev-user': 'ann', 'x-client-version': '1', ...more });
  await fetch(`${base}/api/me`, { headers: headers() });
  await sql`update users set plan = 'paid' where auth_user_id = 'dev:ann'`.execute(db); // account backups are for paid accounts and admins
  const put = (file: ReturnType<typeof fileOf>) => {
    const score = backupScore(file);
    return fetch(`${base}/api/backups/${TODAY}`, { method: 'PUT', headers: headers({ 'content-type': 'application/octet-stream', 'x-backup-entries': String(score), 'x-backup-score': String(score), 'x-backup-encoding': 'gzip' }), body: gzipSync(JSON.stringify(file)) as never });
  };
  const get = async () => fetch(`${base}/api/backups/${TODAY}`, { headers: headers() }).then(r => r.text());
  return { put, get };
}

describe('account backup with a food log', () => {
  it('returns the food log unchanged, with its typed targets', async () => {
    const c = await start();
    const file = fileOf(entries(25));
    expect(await (await c.put(file)).json()).toMatchObject({ ok: true, saved: true });
    const back = parseDataFile(await c.get());
    expect(back.diet).toEqual(entries(25));
    expect(back.config.diet).toMatchObject({ kcal: 2900 });
  });

  it('keeps a fuller copy when a later copy the same day has no food log', async () => {
    const c = await start();
    await c.put(fileOf(entries(40)));
    const wiped = await c.put(fileOf([]));
    expect(await wiped.json()).toMatchObject({ ok: true, saved: false }); // refused by the shrink guard
    expect(parseDataFile(await c.get()).diet).toHaveLength(40);
  });
});
