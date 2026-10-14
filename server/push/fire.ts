import { Router, type RequestHandler } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/types.ts';
import { TTL_SECONDS, type PushSender } from './send.ts';
import { parseFire } from './validate.ts';

// POST /api/push/fire: Cloud Tasks calls it at the scheduled time (ADR 044). It is not a user route: it sits before sign-in and trusts
// only a Google-signed token for the invoker account. `verify` says whether the bearer token is that.
export interface FireDeps {
  db: Kysely<DB>;
  verify: (token: string) => Promise<boolean>;
  send: PushSender;
  now?: () => number;
  /** In front of the token check, on this route only (app.ts passes the per-address limit). */
  limit?: RequestHandler;
}

export function fireRoute({ db, verify, send, now = Date.now, limit = (_req, _res, next) => next() }: FireDeps): Router {
  const router = Router();
  router.post('/fire', limit, async (req, res) => {
    const token = /^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1];
    if (!token || !(await verify(token).catch(() => false))) return void res.status(401).json({ ok: false, error: 'not allowed' });
    const job = parseFire(req.body);
    if (!job) return void res.status(422).json({ ok: false, error: 'not a push job' });
    // Claiming clears the marker, so a retry of this task finds nothing and sends nothing. No row back: cancelled, replaced, or gone.
    const claimed = (await sql<{ endpoint: string; p256dh: string; auth: string }>`select * from push_claim(${job.subscriptionId}, ${job.kind}, ${job.key}, ${job.at})`.execute(db)).rows[0];
    if (!claimed) return void res.json({ ok: true, sent: false });
    // A send that comes minutes after its time (Cloud Tasks behind, a cold start) would say "rest over" long after: drop it.
    if (now() - job.at > TTL_SECONDS[job.kind] * 1000) return void res.json({ ok: true, sent: false });
    const result = await send(claimed, { kind: job.kind, key: job.key, at: job.at, body: job.text }, TTL_SECONDS[job.kind]);
    if (result === 'sent') await sql`select push_sent(${job.subscriptionId})`.execute(db);
    if (result === 'gone') await sql`select push_gone(${job.subscriptionId})`.execute(db);
    // Always 200 once claimed: Cloud Tasks retrying would find nothing to send, and a retry of a late alert is worse than none.
    res.json({ ok: true, sent: result === 'sent' });
  });
  return router;
}
