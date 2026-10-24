import express, { Router, type RequestHandler } from 'express';
import { sql, type Kysely } from 'kysely';
import Stripe from 'stripe';
import { inUserTransaction } from './auth.ts';
import type { DB } from './db/types.ts';

// Billing (ADR 065, brief billing-stripe-subscriptions). Stripe-hosted Checkout and Customer Portal; the webhook turns subscription
// events into `users.plan` through apply_subscription_event (which owns the rules: only free and paid move, an older event never undoes a
// newer one, a repeated event does nothing). Everything here is behind a seam (StripeApi) so tests run without Stripe.

export interface BillingConfig {
  secretKey: string;
  webhookSecret: string;
  priceMonthly: string;
  priceYearly: string;
  /** Where Stripe sends the person back to: this app's own address. */
  returnUrl: string;
}

export type BillingInterval = 'month' | 'year';

/** A webhook event reduced to what the app reads. */
export interface BillingEvent {
  id: string;
  type: string;
  createdAt: Date;
  userId: string | null;
  customerId: string | null;
  /** The plan the subscription implies, or null to only link the customer. */
  plan: 'free' | 'paid' | null;
  status: string | null;
  renewsAt: Date | null;
}

export interface StripeApi {
  checkoutUrl(args: { userId: string; customerId: string | null; price: string; returnUrl: string }): Promise<string>;
  portalUrl(args: { customerId: string; returnUrl: string }): Promise<string>;
  /** Deleting the customer also ends its subscriptions at once. */
  deleteCustomer(customerId: string): Promise<void>;
  /** Throws when the signature is missing or wrong. */
  readEvent(rawBody: Buffer, signature: string | undefined): BillingEvent | null;
}

/** Settings from the environment. Undefined (billing off) when any is missing, or when a live key is given without BILLING_LIVE=1. */
export function billingConfigFrom(env: Record<string, string | undefined>, returnUrl: string | undefined): { config?: BillingConfig; problem?: string } {
  const { STRIPE_SECRET_KEY: secretKey, STRIPE_WEBHOOK_SECRET: webhookSecret, STRIPE_PRICE_MONTHLY: priceMonthly, STRIPE_PRICE_YEARLY: priceYearly } = env;
  if (!secretKey && !webhookSecret && !priceMonthly && !priceYearly) return {};
  if (!secretKey || !webhookSecret || !priceMonthly || !priceYearly || !returnUrl) return { problem: 'billing is off: set all of STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY' };
  if (secretKey.startsWith('sk_live_') && env.BILLING_LIVE !== '1') return { problem: 'billing is off: a live Stripe key needs BILLING_LIVE=1' };
  if (!/^(sk|rk)_(test|live)_/.test(secretKey)) return { problem: 'billing is off: STRIPE_SECRET_KEY does not look like a Stripe key' };
  return { config: { secretKey, webhookSecret, priceMonthly, priceYearly, returnUrl: returnUrl.replace(/\/$/, '') } };
}

/** The plan a subscription status implies. past_due stays paid while Stripe retries the card; incomplete changes nothing. */
export function planForStatus(status: string): 'free' | 'paid' | null {
  switch (status) {
    case 'active': case 'trialing': case 'past_due': return 'paid';
    case 'canceled': case 'unpaid': case 'incomplete_expired': case 'paused': return 'free';
    default: return null;
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const idOf = (v: unknown): string | null => str(v) ?? str((v as { id?: unknown } | null)?.id);
const secondsToDate = (v: unknown): Date | null => (typeof v === 'number' && Number.isFinite(v) ? new Date(v * 1000) : null);

/** Reduces a verified Stripe event. Anything the app does not act on is null (the route answers 200 and moves on). */
export function eventFrom(event: { id: string; type: string; created: number; data: { object: unknown } }): BillingEvent | null {
  const o = event.data.object as Record<string, unknown>;
  const base = { id: event.id, type: event.type, createdAt: new Date(event.created * 1000) };
  if (event.type === 'checkout.session.completed') {
    if (o.mode !== 'subscription') return null;
    return { ...base, userId: str(o.client_reference_id), customerId: idOf(o.customer), plan: null, status: null, renewsAt: null };
  }
  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : str(o.status);
    if (!status) return null;
    const item = (o.items as { data?: Array<{ current_period_end?: unknown }> } | undefined)?.data?.[0];
    const metadata = (o.metadata ?? {}) as Record<string, unknown>;
    return { ...base, userId: str(metadata.user_id), customerId: idOf(o.customer), plan: planForStatus(status), status, renewsAt: secondsToDate(o.current_period_end ?? item?.current_period_end) };
  }
  return null;
}

/** The real Stripe client. */
export function stripeApi(config: BillingConfig, client?: Stripe): StripeApi {
  const stripe = client ?? new Stripe(config.secretKey, { maxNetworkRetries: 2, timeout: 15_000 });
  return {
    async checkoutUrl({ userId, customerId, price, returnUrl }) {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price, quantity: 1 }],
        client_reference_id: userId,
        subscription_data: { metadata: { user_id: userId } },
        ...(customerId ? { customer: customerId } : {}),
        success_url: `${returnUrl}/?billing=success`,
        cancel_url: `${returnUrl}/?billing=cancel`,
      });
      if (!session.url) throw new Error('Stripe returned no checkout address');
      return session.url;
    },
    async portalUrl({ customerId, returnUrl }) {
      return (await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${returnUrl}/` })).url;
    },
    async deleteCustomer(customerId) {
      try {
        await stripe.customers.del(customerId);
      } catch (err) {
        // Already gone (deleted in the dashboard, a first attempt that got that far, a test-mode id after switching keys): nothing left to cancel.
        if ((err as { code?: string }).code !== 'resource_missing') throw err;
      }
    },
    readEvent(rawBody, signature) {
      if (!signature) throw new Error('no signature');
      return eventFrom(stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret));
    },
  };
}

export interface BillingSummary {
  available: boolean;
  source: string;
  status: string | null;
  renewsAt: string | null;
  hasCustomer: boolean;
}

interface BillingRow {
  plan: string;
  plan_source: string;
  plan_status: string | null;
  plan_renews_at: Date | string | null;
  stripe_customer_id: string | null;
}

const readBilling = (db: Kysely<DB>, userId: string) =>
  inUserTransaction(db, userId, async trx =>
    (await sql<BillingRow>`select plan, plan_source, plan_status, plan_renews_at, stripe_customer_id from users where id = current_setting('app.user_id')::bigint`.execute(trx)).rows[0],
  );

/** What /api/me tells the Billing section. `available` is false when billing is off. */
export async function billingSummary(db: Kysely<DB>, userId: string, on: boolean): Promise<BillingSummary> {
  if (!on) return { available: false, source: 'manual', status: null, renewsAt: null, hasCustomer: false }; // billing off: no second database read on every /api/me
  const row = await readBilling(db, userId);
  return {
    available: true,
    source: row?.plan_source ?? 'manual',
    status: row?.plan_status ?? null,
    renewsAt: row?.plan_renews_at ? new Date(row.plan_renews_at).toISOString() : null,
    hasCustomer: !!row?.stripe_customer_id,
  };
}

export const applyEvent = async (db: Kysely<DB>, e: BillingEvent): Promise<string> =>
  (await sql<{ r: string }>`select apply_subscription_event(${e.id}, ${e.type}, ${e.createdAt.toISOString()}::timestamptz, ${e.userId}::bigint, ${e.customerId}, ${e.plan}, ${e.status}, ${e.renewsAt?.toISOString() ?? null}::timestamptz) as r`.execute(db)).rows[0]!.r;

/** POST /api/stripe/webhook. Mounted before every body parser: the signature covers the exact bytes, so the body stays a Buffer. */
export function webhookRoute(db: Kysely<DB>, api: StripeApi | undefined): RequestHandler[] {
  return [
    express.raw({ type: 'application/json', limit: '256kb' }),
    async (req, res) => {
      if (!api) return void res.status(503).json({ ok: false, error: 'billing is off' });
      let event: BillingEvent | null;
      try {
        event = api.readEvent(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), req.get('stripe-signature'));
      } catch {
        return void res.status(400).json({ ok: false, error: 'bad signature' });
      }
      if (!event) return void res.json({ ok: true, result: 'ignored' });
      try {
        const result = await applyEvent(db, event);
        console.log(JSON.stringify({ msg: 'billing event', type: event.type, result }));
        res.json({ ok: true, result });
      } catch (err) {
        // 500 makes Stripe send the event again later; the handler is safe to repeat.
        console.error(JSON.stringify({ msg: 'billing event failed', type: event.type, error: err instanceof Error ? err.message : String(err) }));
        res.status(500).json({ ok: false, error: 'could not apply the event' });
      }
    },
  ];
}

/** POST /api/billing/checkout and /api/billing/portal, behind sign-in and a per-user limit. */
export function billingRoutes({ db, api, config }: { db: Kysely<DB>; api: StripeApi | undefined; config: BillingConfig | undefined }): Router {
  const router = Router();
  router.use((_req, res, next) => (api && config ? next() : void res.status(503).json({ ok: false, error: 'billing is off' })));

  router.post('/checkout', async (req, res) => {
    const interval = (req.body as { interval?: unknown } | undefined)?.interval;
    if (interval !== 'month' && interval !== 'year') return void res.status(422).json({ ok: false, error: 'interval must be month or year' });
    try {
      const userId = String(res.locals.userId);
      const row = await readBilling(db, userId);
      if (!row) return void res.status(404).json({ ok: false, error: 'no such account' });
      if (row.plan === 'lifetime' || row.plan === 'founder') return void res.status(409).json({ ok: false, error: 'nothing to pay for this plan' });
      if (row.plan !== 'free' && row.plan !== 'paid') return void res.status(409).json({ ok: false, error: 'this plan is changed by the owner' });
      if (row.plan === 'paid' && row.plan_source === 'stripe') return void res.status(409).json({ ok: false, error: 'already subscribed: use Manage billing' });
      const url = await api!.checkoutUrl({ userId, customerId: row.stripe_customer_id, price: interval === 'year' ? config!.priceYearly : config!.priceMonthly, returnUrl: config!.returnUrl });
      res.json({ ok: true, url });
    } catch (err) {
      console.error(JSON.stringify({ msg: 'checkout failed', error: err instanceof Error ? err.message : String(err) }));
      res.status(502).json({ ok: false, error: 'Billing is unavailable, try again' });
    }
  });

  router.post('/portal', async (_req, res) => {
    try {
      const row = await readBilling(db, String(res.locals.userId));
      if (!row?.stripe_customer_id) return void res.status(409).json({ ok: false, error: 'no subscription yet' });
      res.json({ ok: true, url: await api!.portalUrl({ customerId: row.stripe_customer_id, returnUrl: config!.returnUrl }) });
    } catch (err) {
      console.error(JSON.stringify({ msg: 'portal failed', error: err instanceof Error ? err.message : String(err) }));
      res.status(502).json({ ok: false, error: 'Billing is unavailable, try again' });
    }
  });

  return router;
}

/** For deleting an account: ends the subscription first by deleting the Stripe customer. Throws when Stripe cannot be reached, so nothing is erased. */
export function cancelBillingFor(db: Kysely<DB>, api: StripeApi | undefined): (userId: string) => Promise<void> {
  return async userId => {
    if (!api) return;
    const row = await readBilling(db, userId);
    if (row?.stripe_customer_id) await api.deleteCustomer(row.stripe_customer_id);
  };
}
