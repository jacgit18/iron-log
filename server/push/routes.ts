import { Router } from 'express';
import { sql, type Kysely } from 'kysely';
import { inUserTransaction } from '../auth.ts';
import type { DB } from '../db/types.ts';
import { pendingCap } from './pendingCap.ts';
import type { PushScheduler } from './scheduler.ts';
import { MAX_SUBSCRIPTIONS, parseCancel, parseSchedule, parseSubscription, parseUnsubscribe } from './validate.ts';

// The device side of Web Push (ADR 044): register a browser, remove it, and ask for a push later or take the ask back (the fire route is fire.ts). Mounted at
// /api/push behind sign-in and a per-user limit (open to every signed-in account since 2026-10-19; it was admin-only). An endpoint is a credential, so it is never returned and never logged.
export interface PushDeps {
  db: Kysely<DB>;
  publicKey?: string;
  scheduler?: PushScheduler;
  now?: () => number;
}

const bad = (error: string) => ({ status: 422, body: { ok: false, error } });

export function pushRoutes({ db, publicKey, scheduler, now = Date.now }: PushDeps): Router {
  const router = Router();
  const mine = (userId: unknown) => String(userId);
  const cap = pendingCap();

  router.get('/key', (_req, res) => {
    if (!publicKey) return void res.status(503).json({ ok: false, error: 'push is not set up on this server' });
    res.json({ ok: true, publicKey });
  });

  router.post('/subscribe', async (req, res) => {
    if (!publicKey) return void res.status(503).json({ ok: false, error: 'push is not set up on this server' });
    const sub = parseSubscription(req.body);
    if (!sub) { const r = bad('send { endpoint (https), keys: { p256dh, auth } }'); return void res.status(r.status).json(r.body); }
    const result = await inUserTransaction(db, mine(res.locals.userId), async trx => {
      // Another account's row for this browser goes first (shared phone), then this account's row is added or its keys renewed.
      // If the cap below then refuses, the other account's row is still gone: the browser is this account's now, so that is intended.
      await sql`select claim_push_endpoint(${sub.endpoint})`.execute(trx);
      const count = Number((await sql<{ n: string }>`select count(*) as n from push_subscription where endpoint <> ${sub.endpoint}`.execute(trx)).rows[0]!.n);
      if (count >= MAX_SUBSCRIPTIONS) return { status: 422, body: { ok: false, error: `at most ${MAX_SUBSCRIPTIONS} devices; turn push off on one first` } };
      await trx.insertInto('push_subscription').values({ user_id: mine(res.locals.userId), ...sub })
        .onConflict(oc => oc.columns(['user_id', 'endpoint']).doUpdateSet({ p256dh: sub.p256dh, auth: sub.auth })).execute();
      return { status: 200, body: { ok: true } };
    });
    res.status(result.status).json(result.body);
  });

  router.post('/unsubscribe', async (req, res) => {
    const u = parseUnsubscribe(req.body);
    if (!u) { const r = bad('send { endpoint (https) }'); return void res.status(r.status).json(r.body); }
    // The row going is enough: a task already queued for it finds nothing to claim (migration 019).
    await inUserTransaction(db, mine(res.locals.userId), trx => trx.deleteFrom('push_subscription').where('endpoint', '=', u.endpoint).execute());
    res.json({ ok: true });
  });

  router.post('/schedule', async (req, res) => {
    if (!scheduler) return void res.status(503).json({ ok: false, error: 'push scheduling is not set up on this server' });
    const job = parseSchedule(req.body, now());
    if (!job) { const r = bad('send { endpoint, kind: rest|day-nudge, key (letters, digits, - or _), at (ms, within 3 hours), body (up to 140 characters) }'); return void res.status(r.status).json(r.body); }
    // Each accepted call queues a billed Cloud Task that fires even if replaced, so an account may have only so many waiting (pendingCap.ts, S-5).
    const who = mine(res.locals.userId);
    if (!cap.tryReserve(who, job.at, now())) return void res.status(429).json({ ok: false, error: 'too many scheduled notifications waiting; try again later' });
    // The marker is what says this send is still wanted; a newer schedule of the same kind replaces it, so the older task sends nothing.
    const id = await inUserTransaction(db, mine(res.locals.userId), async trx =>
      (await trx.updateTable('push_subscription')
        .set({ pending: sql`jsonb_set(pending, ${[job.kind]}::text[], ${JSON.stringify({ key: job.key, at: job.at })}::jsonb)` })
        .where('endpoint', '=', job.endpoint).returning('id').executeTakeFirst())?.id);
    if (!id) { cap.release(who, job.at); return void res.status(404).json({ ok: false, error: 'this device is not subscribed' }); }
    try {
      await scheduler.schedule({ subscriptionId: String(id), kind: job.kind, key: job.key, at: job.at, body: job.text });
    } catch (err) {
      cap.release(who, job.at);
      console.error(JSON.stringify({ msg: 'push schedule failed', error: err instanceof Error ? err.message : String(err) }));
      return void res.status(502).json({ ok: false, error: 'could not schedule the push' });
    }
    res.json({ ok: true });
  });

  router.post('/cancel', async (req, res) => {
    const c = parseCancel(req.body);
    if (!c) { const r = bad('send { endpoint, kind: rest|day-nudge, key? }'); return void res.status(r.status).json(r.body); }
    // With a key, only that schedule is cancelled, so a late cancel from an old timer cannot undo a newer one.
    await inUserTransaction(db, mine(res.locals.userId), trx => {
      let q = trx.updateTable('push_subscription').set({ pending: sql`pending - ${c.kind}::text` }).where('endpoint', '=', c.endpoint);
      if (c.key) q = q.where(sql`pending -> ${c.kind}::text ->> 'key'`, '=', c.key);
      return q.execute();
    });
    res.json({ ok: true }); // cancelling something that is not there is not an error
  });

  return router;
}
