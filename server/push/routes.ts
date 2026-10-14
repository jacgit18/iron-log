import { Router } from 'express';
import { sql, type Kysely, type Transaction } from 'kysely';
import { inUserTransaction } from '../auth.ts';
import type { DB } from '../db/types.ts';
import { PUSH_KINDS, type PushScheduler } from './scheduler.ts';
import { MAX_SUBSCRIPTIONS, parseCancel, parseSchedule, parseSubscription, parseUnsubscribe } from './validate.ts';

// The device side of Web Push (ADR 044): register a browser, remove it, and ask for a push later or take the ask back. Mounted at
// /api/push behind sign-in, requireAdmin and a per-user limit. An endpoint is a credential, so it is never returned and never logged.
export interface PushDeps {
  db: Kysely<DB>;
  publicKey?: string;
  scheduler?: PushScheduler;
  now?: () => number;
}

const bad = (error: string) => ({ status: 422, body: { ok: false, error } });
const subscriptionId = async (trx: Transaction<DB>, endpoint: string) =>
  (await trx.selectFrom('push_subscription').select('id').where('endpoint', '=', endpoint).executeTakeFirst())?.id;

export function pushRoutes({ db, publicKey, scheduler, now = Date.now }: PushDeps): Router {
  const router = Router();
  const mine = (userId: unknown) => String(userId);

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
    // Delete inside the transaction, cancel after it: the scheduler is a network call and must not hold a pooled connection open.
    const id = await inUserTransaction(db, mine(res.locals.userId), async trx =>
      (await trx.deleteFrom('push_subscription').where('endpoint', '=', u.endpoint).returning('id').executeTakeFirst())?.id);
    if (id && scheduler) for (const kind of PUSH_KINDS) await scheduler.cancel({ subscriptionId: String(id), kind }).catch(() => undefined);
    res.json({ ok: true });
  });

  router.post('/schedule', async (req, res) => {
    if (!scheduler) return void res.status(503).json({ ok: false, error: 'push scheduling is not set up on this server' });
    const job = parseSchedule(req.body, now());
    if (!job) { const r = bad('send { endpoint, kind: rest|day-nudge, key, at (ms, within 3 hours), body (up to 140 characters) }'); return void res.status(r.status).json(r.body); }
    const id = await inUserTransaction(db, mine(res.locals.userId), trx => subscriptionId(trx, job.endpoint));
    if (!id) return void res.status(404).json({ ok: false, error: 'this device is not subscribed' });
    await scheduler.schedule({ subscriptionId: String(id), kind: job.kind, key: job.key, at: job.at, body: job.text });
    res.json({ ok: true });
  });

  router.post('/cancel', async (req, res) => {
    if (!scheduler) return void res.status(503).json({ ok: false, error: 'push scheduling is not set up on this server' });
    const c = parseCancel(req.body);
    if (!c) { const r = bad('send { endpoint, kind: rest|day-nudge, key? }'); return void res.status(r.status).json(r.body); }
    const id = await inUserTransaction(db, mine(res.locals.userId), trx => subscriptionId(trx, c.endpoint));
    if (id) await scheduler.cancel({ subscriptionId: String(id), kind: c.kind, ...(c.key ? { key: c.key } : {}) });
    res.json({ ok: true }); // cancelling something that is not there is not an error
  });

  return router;
}
