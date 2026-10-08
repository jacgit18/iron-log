import { fromNodeHeaders } from 'better-auth/node';
import type { RequestHandler } from 'express';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { Auth } from './auth/betterAuth.ts';
import type { DB } from './db/types.ts';

// Who is calling (ADR 004). Everything after this reads one value, res.locals.userId, our own users.id.
// 1. A Better Auth session cookie: the signed-in Google account. Found or created in `users` by `auth_user_id`.
// 2. Only where it is allowed (NODE_ENV development or test): a development header naming a fixed dev user, e.g.
//    `X-Dev-User: owner`. Nothing is checked beyond the name, so it must never run anywhere else.
// 3. Otherwise 401, which the phone treats as "pause and keep everything, ask to sign in", never as "drop the write".
// A failure to look the session up (the database is down) is a 503, not a 401: it must never look like being signed out.
export const DEV_USER_HEADER = 'x-dev-user';
const DEV_USER_NAME = /^[a-z0-9_-]{1,40}$/;

export function devAuthAllowed(env: string | undefined): boolean {
  return env === 'development' || env === 'test';
}

/** Who is calling, for /api/me and the account screen. */
export interface Account {
  kind: 'session' | 'dev';
  email: string | null;
  name: string | null;
}

const signInRequired = { ok: false, error: 'sign-in required' };

// ensure_user() (migration 009) finds or makes the row. It runs as the table owner, because under row-level security the
// API's own role cannot insert into users or see a row that does not exist yet. One round trip, safe under concurrent first
// requests (the no-op update inside lets RETURNING work on a conflict).
async function ensureUser(db: Kysely<DB>, authUserId: string): Promise<string> {
  const { rows } = await sql<{ id: string }>`select ensure_user(${authUserId}) as id`.execute(db);
  return rows[0]!.id;
}

export function sessionAuth(db: Kysely<DB>, auth?: Auth): RequestHandler {
  return async (req, res, next) => {
    try {
      const session = auth ? await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }) : null;
      if (session) {
        res.locals.userId = await ensureUser(db, session.user.id);
        res.locals.account = { kind: 'session', email: session.user.email ?? null, name: session.user.name ?? null } satisfies Account;
        next();
        return;
      }
      // Refuse before reading the header, so a production build can never be signed in by it. An unset NODE_ENV is refused too.
      const name = devAuthAllowed(process.env.NODE_ENV) ? req.get(DEV_USER_HEADER) : undefined;
      if (!name || !DEV_USER_NAME.test(name)) {
        res.status(401).json(signInRequired);
        return;
      }
      res.locals.userId = await ensureUser(db, `dev:${name}`);
      res.locals.account = { kind: 'dev', email: null, name: `dev:${name}` } satisfies Account;
      next();
    } catch (err) {
      console.error(JSON.stringify({ msg: 'could not tell who is calling', error: err instanceof Error ? err.message : String(err) }));
      res.status(503).json({ ok: false, error: 'sign-in unavailable' });
    }
  };
}

/** The development sign-in alone (no Better Auth). Kept for tests of the rest of the API. */
export const devAuth = (db: Kysely<DB>): RequestHandler => sessionAuth(db);

// One transaction per request. `app.user_id` is what row-level security reads once Phase B turns it on; set_config with
// is_local = true is SET LOCAL, so it ends with the transaction and cannot leak to the next user of a pooled connection.
export function inUserTransaction<T>(db: Kysely<DB>, userId: string, fn: (trx: Transaction<DB>) => Promise<T>): Promise<T> {
  return db.transaction().execute(async trx => {
    await sql`select set_config('app.user_id', ${userId}, true)`.execute(trx);
    return fn(trx);
  });
}
