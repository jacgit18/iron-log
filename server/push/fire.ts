import { Router, type RequestHandler } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/types.ts';
import { TTL_SECONDS, type PushSender } from './send.ts';
import type { PushScheduler } from './scheduler.ts';
import { MAX_AHEAD_MS, parseFire } from './validate.ts';

// POST /api/push/fire: Cloud Tasks calls it at the scheduled time (ADR 044). It is not a user route: it sits before sign-in and trusts
// only a Google-signed token for the invoker account. `verify` says whether the bearer token is that.
export interface FireDeps {
  db: Kysely<DB>;
  verify: (token: string) => Promise<boolean>;
  send: PushSender;
  /** Queues the next reminder of a repeating kind. Without one, a repeating job sends once. */
  scheduler?: PushScheduler;
  now?: () => number;
  /** In front of the token check, on this route only (app.ts passes the per-address limit). */
  limit?: RequestHandler;
}

export function fireRoute({ db, verify, send, scheduler, now = Date.now, limit = (_req, _res, next) => next() }: FireDeps): Router {
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
    // A repeating reminder that is dropped as late still queues the next one: the chain must not end because Cloud Tasks was behind.
    const late = now() - job.at > TTL_SECONDS[job.kind] * 1000;
    if (late && !job.repeat) return void res.json({ ok: true, sent: false });
    const result = late ? 'late' : await send(claimed, { kind: job.kind, key: job.key, at: job.at, body: job.text }, TTL_SECONDS[job.kind]);
    if (result === 'sent') await sql`select push_sent(${job.subscriptionId})`.execute(db);
    if (result === 'gone') await sql`select push_gone(${job.subscriptionId})`.execute(db);
    // A water reminder queues the next one. A gone browser ends the chain; a failed send does not (a later one may get through). Nothing here may fail the call.
    if (job.repeat && scheduler && result !== 'gone') {
      const at = Math.max(job.at, now()) + job.repeat.everyMs;
      if (at <= job.repeat.until && at <= now() + MAX_AHEAD_MS) {
        const next = { subscriptionId: job.subscriptionId, kind: job.kind, key: `w${at}`, at, body: job.text, repeat: job.repeat };
        try {
          // The marker first, as /schedule does: a task whose marker is not there sends nothing.
          const armed = (await sql<{ ok: boolean }>`select push_rearm(${job.subscriptionId}, ${job.kind}, ${next.key}, ${at}) as ok`.execute(db)).rows[0]?.ok;
          if (armed) await scheduler.schedule(next);
        } catch (err) {
          console.error(JSON.stringify({ msg: 'push chain failed', error: err instanceof Error ? err.message : String(err) }));
        }
      }
    }
    // Always 200 once claimed: Cloud Tasks retrying would find nothing to send, and a retry of a late alert is worse than none.
    res.json({ ok: true, sent: result === 'sent' });
  });
  return router;
}
