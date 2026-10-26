import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { piiBootCheck } from './auth/piiBootCheck.ts';
import { createPiiCrypto } from './auth/piiCrypto.ts';
import { createDb } from './db/connection.ts';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';

// The boot check against a real Postgres with the real migrations (backlog audit #2 and #4): a missing or wrong database key stops the
// server in production, and nothing else is changed. Its own file and database.
let db: Kysely<DB>;
let appUrl: string;
let stop: () => Promise<void>;
const KEY_A = randomBytes(32);
const KEY_B = randomBytes(32);
const prod = (key?: Buffer, extra: Record<string, string> = {}): NodeJS.ProcessEnv =>
  ({ NODE_ENV: 'production', ...(key ? { PII_ENCRYPTION_KEY: key.toString('base64') } : {}), ...extra }) as NodeJS.ProcessEnv;
const addUser = (id: string, email: string) =>
  sql`insert into auth."user" ("id","name","email","emailVerified") values (${id}, 'n', ${email}, true)`.execute(db);

beforeAll(async () => { ({ db, appUrl, stop } = await startTestDatabase()); }, 120_000);
afterAll(async () => { await stop?.(); });
beforeEach(async () => { await sql`delete from auth."user"`.execute(db); });

describe('piiBootCheck', () => {
  it('stops production when the key is missing, and says why without printing a value', async () => {
    const out = await piiBootCheck(prod(), db);
    expect(out.problem).toContain('PII_ENCRYPTION_KEY is not set');
  });

  it('stops production when the key is not 32 bytes of base64', async () => {
    const out = await piiBootCheck(prod(undefined, { PII_ENCRYPTION_KEY: Buffer.alloc(8).toString('base64') }), db);
    expect(out.problem).toContain('PII_ENCRYPTION_KEY must be 32 random bytes');
  });

  it('stops production when the key cannot open a sealed email in the database (the canary), without printing the key or the value', async () => {
    const sealed = createPiiCrypto(KEY_A).sealStable('ada@example.com');
    await addUser('u1', sealed);
    const out = await piiBootCheck(prod(KEY_B), db);
    expect(out.problem).toContain('canary failed');
    expect(out.problem).not.toContain(sealed);
    expect(out.problem).not.toContain(KEY_B.toString('base64'));
  });

  it('passes with the right key and a sealed row', async () => {
    await addUser('u1', createPiiCrypto(KEY_A).sealStable('ada@example.com'));
    const out = await piiBootCheck(prod(KEY_A), db);
    expect(out.problem).toBeUndefined();
    expect(out.note).toContain('opened a sealed value');
  });

  it('passes on an empty database (a fresh or just-emptied one) and says nothing was there to open', async () => {
    const out = await piiBootCheck(prod(KEY_B), db);
    expect(out.problem).toBeUndefined();
    expect(out.note).toContain('no sealed value');
  });

  it('passes on a half-migrated table: it opens a sealed row and tolerates plaintext ones until PII_PLAINTEXT_DONE', async () => {
    await addUser('u1', 'old@example.com');
    await addUser('u2', createPiiCrypto(KEY_A).sealStable('ada@example.com'));
    expect((await piiBootCheck(prod(KEY_A), db)).problem).toBeUndefined();
  });

  it('with PII_PLAINTEXT_DONE=true stops when a row still holds a plaintext email, and passes when none does', async () => {
    await addUser('u1', 'old@example.com');
    const out = await piiBootCheck(prod(KEY_A, { PII_PLAINTEXT_DONE: 'true' }), db);
    expect(out.problem).toContain('1 row(s) in auth."user" still hold a plaintext email');
    expect(out.problem).not.toContain('old@example.com');
    await sql`delete from auth."user"`.execute(db);
    await addUser('u2', createPiiCrypto(KEY_A).sealStable('ada@example.com'));
    expect((await piiBootCheck(prod(KEY_A, { PII_PLAINTEXT_DONE: 'true' }), db)).problem).toBeUndefined();
  });

  it('stops when the database cannot be read, rather than skipping the check', async () => {
    const out = await piiBootCheck(prod(KEY_A), createDb('postgres://u:p@127.0.0.1:1/x'));
    expect(out.problem).toContain('could not read auth."user"');
  });

  it('with no database configured, checks the key itself and skips the canary', async () => {
    const out = await piiBootCheck(prod(KEY_A), undefined);
    expect(out.problem).toBeUndefined();
    expect(out.note).toContain('no database');
  });

  it.each(['development', 'test', undefined])('does not check outside production (NODE_ENV=%s): a missing key still starts the server', async nodeEnv => {
    const env = (nodeEnv ? { NODE_ENV: nodeEnv } : {}) as NodeJS.ProcessEnv;
    const out = await piiBootCheck(env, db);
    expect(out.problem).toBeUndefined();
    expect(out.note).toContain('not checked');
  });
});

describe('server/index.ts', () => {
  it('exits with code 1 and the reason when production has no database key', async () => {
    // Run the way development runs it (tsx), since Node's own TypeScript stripping cannot read this server's source.
    const child = spawn(resolve('node_modules/.bin/tsx'), [resolve('server/index.ts')], {
      env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production', APP_DATABASE_URL: appUrl, PORT: '3991' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', d => { err += String(d); });
    const code = await new Promise<number | null>(done => child.on('close', done));
    expect(code).toBe(1);
    expect(err).toContain('Refusing to start: PII_ENCRYPTION_KEY is not set');
  });
});
