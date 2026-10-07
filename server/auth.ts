import type { RequestHandler } from 'express';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { DB } from './db/types.ts';

// A5 stand-in for sign-in (build spec 6a). Phase B (Better Auth) replaces it: the session will set the same res.locals.userId.
// The header names a fixed dev user, e.g. `X-Dev-User: owner`. Nothing is checked beyond the name, so it must never run
// outside development and test.
export const DEV_USER_HEADER = 'x-dev-user';
const DEV_USER_NAME = /^[a-z0-9_-]{1,40}$/;

export function devAuthAllowed(env: string | undefined): boolean {
  return env === 'development' || env === 'test';
}

export function devAuth(db: Kysely<DB>): RequestHandler {
  return async (req, res, next) => {
    // Refuse before reading the header, so a production build can never be signed in by it. An unset NODE_ENV is refused too.
    if (!devAuthAllowed(process.env.NODE_ENV)) {
      res.status(401).json({ ok: false, error: 'sign-in required' });
      return;
    }
    const name = req.get(DEV_USER_HEADER);
    if (!name || !DEV_USER_NAME.test(name)) {
      res.status(401).json({ ok: false, error: 'sign-in required' });
      return;
    }
    try {
      // The no-op update makes RETURNING work on a conflict, so this is one round trip and safe under concurrent first requests.
      const user = await db
        .insertInto('users')
        .values({ auth_user_id: `dev:${name}` })
        .onConflict(oc => oc.column('auth_user_id').doUpdateSet({ auth_user_id: `dev:${name}` }))
        .returning('id')
        .executeTakeFirstOrThrow();
      res.locals.userId = user.id;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// One transaction per request. `app.user_id` is what row-level security reads once Phase B turns it on; set_config with
// is_local = true is SET LOCAL, so it ends with the transaction and cannot leak to the next user of a pooled connection.
export function inUserTransaction<T>(db: Kysely<DB>, userId: string, fn: (trx: Transaction<DB>) => Promise<T>): Promise<T> {
  return db.transaction().execute(async trx => {
    await sql`select set_config('app.user_id', ${userId}, true)`.execute(trx);
    return fn(trx);
  });
}
