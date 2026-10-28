import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type Kysely } from 'kysely';
import Stripe from 'stripe';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { billingConfigFrom, eventFrom, planForStatus, stripeApi, type BillingConfig, type BillingEvent, type StripeApi } from './billing.ts';
import { createDb } from './db/connection.ts';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';

// Billing (ADR 065): the settings, the event mapping, the webhook rules (signature, replay, order, who may change), Checkout and Portal,
// and deleting an account that has a subscription. Stripe itself is a stub except where the real signature check is the point.
const CONFIG: BillingConfig = { secretKey: 'sk_test_123', webhookSecret: 'whsec_test', priceMonthly: 'price_m', priceYearly: 'price_y', returnUrl: 'https://app.example' };

describe('settings', () => {
  const env = { STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_WEBHOOK_SECRET: 'whsec_1', STRIPE_PRICE_MONTHLY: 'price_m', STRIPE_PRICE_YEARLY: 'price_y' };
  it('is off, with no complaint, when nothing is set', () => {
    expect(billingConfigFrom({}, 'https://app.example')).toEqual({});
  });
  it('is off, with the reason, when only some settings are set', () => {
    expect(billingConfigFrom({ ...env, STRIPE_PRICE_YEARLY: undefined }, 'https://app.example').problem).toMatch(/set all of/);
    expect(billingConfigFrom(env, undefined).problem).toMatch(/set all of/);
  });
  it('refuses a live key unless BILLING_LIVE=1', () => {
    const live = { ...env, STRIPE_SECRET_KEY: 'sk_live_1' };
    expect(billingConfigFrom(live, 'https://app.example')).toEqual({ problem: expect.stringMatching(/BILLING_LIVE=1/) });
    expect(billingConfigFrom({ ...live, BILLING_LIVE: '1' }, 'https://app.example').config?.secretKey).toBe('sk_live_1');
  });
  it('refuses a live restricted key (rk_live_) unless BILLING_LIVE=1, like an sk_live_ key', () => {
    const live = { ...env, STRIPE_SECRET_KEY: 'rk_live_1' };
    expect(billingConfigFrom(live, 'https://app.example')).toEqual({ problem: expect.stringMatching(/BILLING_LIVE=1/) });
    expect(billingConfigFrom({ ...live, BILLING_LIVE: '1' }, 'https://app.example').config?.secretKey).toBe('rk_live_1');
    expect(billingConfigFrom({ ...env, STRIPE_SECRET_KEY: 'rk_test_1' }, 'https://app.example').config?.secretKey).toBe('rk_test_1');
  });
  it('refuses a value that is not a Stripe key, and trims the trailing slash of the return address', () => {
    expect(billingConfigFrom({ ...env, STRIPE_SECRET_KEY: 'hello' }, 'https://app.example').problem).toMatch(/does not look like/);
    expect(billingConfigFrom(env, 'https://app.example/').config?.returnUrl).toBe('https://app.example');
  });
});

describe('subscription status to plan', () => {
  it.each([['active', 'paid'], ['trialing', 'paid'], ['past_due', 'paid'], ['canceled', 'free'], ['unpaid', 'free'], ['incomplete_expired', 'free'], ['paused', 'free'], ['incomplete', null]])('%s is %s', (status, plan) => {
    expect(planForStatus(status)).toBe(plan);
  });
});

describe('reading a Stripe event', () => {
  const at = 1_800_000_000;
  it('links the customer from a completed subscription checkout and ignores other modes', () => {
    const base = { id: 'evt_1', type: 'checkout.session.completed', created: at };
    expect(eventFrom({ ...base, data: { object: { mode: 'subscription', client_reference_id: '7', customer: 'cus_1' } } })).toMatchObject({ userId: '7', customerId: 'cus_1', plan: null });
    expect(eventFrom({ ...base, data: { object: { mode: 'payment', client_reference_id: '7', customer: 'cus_1' } } })).toBeNull();
  });
  it('reads a subscription: plan from the status, renewal from the period end (top level or on the item)', () => {
    const base = { id: 'evt_2', type: 'customer.subscription.updated', created: at };
    expect(eventFrom({ ...base, data: { object: { status: 'active', customer: 'cus_1', metadata: { user_id: '7' }, current_period_end: at + 100 } } })).toMatchObject({ userId: '7', customerId: 'cus_1', plan: 'paid', status: 'active', renewsAt: new Date((at + 100) * 1000) });
    expect(eventFrom({ ...base, data: { object: { status: 'past_due', customer: { id: 'cus_1' }, items: { data: [{ current_period_end: at + 5 }] } } } })).toMatchObject({ customerId: 'cus_1', plan: 'paid', renewsAt: new Date((at + 5) * 1000) });
  });
  it('treats a deleted subscription as canceled whatever its last status said', () => {
    expect(eventFrom({ id: 'evt_3', type: 'customer.subscription.deleted', created: at, data: { object: { status: 'active', customer: 'cus_1' } } })).toMatchObject({ plan: 'free', status: 'canceled' });
  });
  it('ignores events the app does not act on', () => {
    expect(eventFrom({ id: 'evt_4', type: 'invoice.payment_failed', created: at, data: { object: {} } })).toBeNull();
  });
});

describe('the real signature check', () => {
  const stripe = new Stripe('sk_test_123');
  const payload = JSON.stringify({ id: 'evt_9', object: 'event', type: 'customer.subscription.updated', created: 1_800_000_000, data: { object: { status: 'active', customer: 'cus_1', metadata: { user_id: '3' } } } });
  const api = stripeApi(CONFIG);
  it('accepts a payload signed with the webhook secret', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: CONFIG.webhookSecret });
    expect(api.readEvent(Buffer.from(payload), header)).toMatchObject({ id: 'evt_9', plan: 'paid', userId: '3' });
  });
  it('refuses a wrong signature, a payload changed after signing, and no signature', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_other' });
    expect(() => api.readEvent(Buffer.from(payload), header)).toThrow();
    const good = stripe.webhooks.generateTestHeaderString({ payload, secret: CONFIG.webhookSecret });
    expect(() => api.readEvent(Buffer.from(payload.replace('cus_1', 'cus_2')), good)).toThrow();
    expect(() => api.readEvent(Buffer.from(payload), undefined)).toThrow();
  });
});

let owner: Kysely<DB>;
let app: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server | undefined;
let deleted: string[];
let deleteFails: boolean;

beforeAll(async () => {
  let appUrl: string;
  ({ db: owner, stop, appUrl } = await startTestDatabase());
  app = createDb(appUrl);
}, 120_000);
afterAll(async () => {
  await app.destroy();
  await stop?.();
});
afterEach(() => new Promise<void>(done => (server ? server.close(() => done()) : done())));
beforeEach(async () => {
  deleted = [];
  deleteFails = false;
  await owner.deleteFrom('stripe_events').execute();
  await owner.deleteFrom('users').where('auth_user_id', 'like', 'dev:%').execute(); // each test makes its own accounts
});

/** A Stripe whose signature is the word "good" and whose body is the BillingEvent as JSON. */
const stub: StripeApi = {
  checkoutUrl: async ({ userId, customerId, price }) => `https://checkout.example/${userId}/${customerId ?? 'new'}/${price}`,
  portalUrl: async ({ customerId }) => `https://portal.example/${customerId}`,
  deleteCustomer: async id => {
    if (deleteFails) throw new Error('stripe is down');
    deleted.push(id);
  },
  readEvent: (raw, signature) => {
    if (signature !== 'good') throw new Error('bad signature');
    const e = JSON.parse(raw.toString()) as BillingEvent;
    return { ...e, createdAt: new Date(e.createdAt), renewsAt: e.renewsAt ? new Date(e.renewsAt) : null };
  },
};

async function start(billing: { api: StripeApi; config: BillingConfig } | null = { api: stub, config: CONFIG }, admins = ['dev:boss']) {
  server = createApp({ db: app, admins: new Set(admins), billing: billing ?? undefined }).listen(0);
  await new Promise(done => server!.once('listening', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const as = (who: string, method: string, path: string, body?: unknown) =>
    fetch(`${base}${path}`, { method, headers: { 'x-dev-user': who, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const hook = (event: Partial<BillingEvent> & { id: string }, signature = 'good') =>
    fetch(`${base}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: JSON.stringify({ type: 'customer.subscription.updated', createdAt: '2026-11-01T00:00:00Z', userId: null, customerId: null, plan: 'paid', status: 'active', renewsAt: '2026-12-01T00:00:00Z', ...event }) });
  /** Makes the account (a dev user is created on first sight) and sets its plan as the owner. */
  const account = async (who: string, plan = 'free', extra: Record<string, unknown> = {}) => {
    await as(who, 'GET', '/api/me');
    await owner.updateTable('users').set({ plan, ...extra }).where('auth_user_id', '=', `dev:${who}`).execute();
    return (await owner.selectFrom('users').select('id').where('auth_user_id', '=', `dev:${who}`).executeTakeFirstOrThrow()).id;
  };
  const row = (who: string) => owner.selectFrom('users').selectAll().where('auth_user_id', '=', `dev:${who}`).executeTakeFirst();
  return { base, as, hook, account, row };
}

describe('the webhook', () => {
  it('refuses a bad or missing signature (400) and changes nothing', async () => {
    const { hook, account, row } = await start();
    const id = await account('ann');
    expect((await hook({ id: 'evt_a', userId: String(id) }, 'forged')).status).toBe(400);
    expect((await hook({ id: 'evt_a', userId: String(id) }, '')).status).toBe(400);
    expect((await row('ann'))!.plan).toBe('free');
  });

  it('makes a free account paid, records who did it and the period, and links the customer', async () => {
    const { hook, account, row } = await start();
    const id = await account('ann');
    const res = await hook({ id: 'evt_1', userId: String(id), customerId: 'cus_ann' });
    expect(await res.json()).toEqual({ ok: true, result: 'applied' });
    expect(await row('ann')).toMatchObject({ plan: 'paid', plan_source: 'stripe', plan_status: 'active', stripe_customer_id: 'cus_ann' });
    expect(new Date((await row('ann'))!.plan_renews_at as unknown as string).toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('finds the account by its customer id when the event carries no user id', async () => {
    const { hook, account, row } = await start();
    await account('ann', 'free', { stripe_customer_id: 'cus_ann' });
    expect(await (await hook({ id: 'evt_2', customerId: 'cus_ann' })).json()).toMatchObject({ result: 'applied' });
    expect((await row('ann'))!.plan).toBe('paid');
  });

  it('ignores an event delivered twice', async () => {
    const { hook, account, row } = await start();
    const id = await account('ann');
    await hook({ id: 'evt_3', userId: String(id), customerId: 'cus_ann' });
    await owner.updateTable('users').set({ plan: 'free' }).where('id', '=', id).execute();
    expect(await (await hook({ id: 'evt_3', userId: String(id), customerId: 'cus_ann' })).json()).toEqual({ ok: true, result: 'duplicate' });
    expect((await row('ann'))!.plan).toBe('free');
  });

  it('does not let an older event undo a newer one', async () => {
    const { hook, account, row } = await start();
    const id = await account('ann');
    await hook({ id: 'evt_new', userId: String(id), customerId: 'cus_ann', createdAt: new Date('2026-11-05T00:00:00Z'), plan: 'free', status: 'canceled' });
    expect(await (await hook({ id: 'evt_old', userId: String(id), customerId: 'cus_ann', createdAt: new Date('2026-11-01T00:00:00Z') })).json()).toMatchObject({ result: 'stale' });
    expect((await row('ann'))!.plan).toBe('free');
  });

  it('drops a lapsed subscription to free but keeps past_due paid', async () => {
    const { hook, account, row } = await start();
    const id = await account('ann');
    await hook({ id: 'evt_p', userId: String(id), customerId: 'cus_ann', createdAt: new Date('2026-11-01T00:00:00Z') });
    await hook({ id: 'evt_d', customerId: 'cus_ann', createdAt: new Date('2026-11-02T00:00:00Z'), status: 'past_due' });
    expect(await row('ann')).toMatchObject({ plan: 'paid', plan_status: 'past_due' });
    await hook({ id: 'evt_c', customerId: 'cus_ann', createdAt: new Date('2026-11-03T00:00:00Z'), plan: 'free', status: 'canceled' });
    expect(await row('ann')).toMatchObject({ plan: 'free', plan_status: 'canceled', plan_source: 'stripe' });
  });

  it.each(['beta', 'lifetime', 'founder'])('never changes a %s account', async plan => {
    const { hook, account, row } = await start();
    const id = await account(`u_${plan}`, plan);
    expect(await (await hook({ id: `evt_${plan}`, userId: String(id), customerId: `cus_${plan}` })).json()).toMatchObject({ result: 'kept' });
    expect(await row(`u_${plan}`)).toMatchObject({ plan, plan_source: 'manual' });
  });

  it('only links the customer for a checkout event (no plan change) and ignores a user it does not know', async () => {
    const { hook, account, row } = await start();
    const id = await account('ann');
    expect(await (await hook({ id: 'evt_l', type: 'checkout.session.completed', userId: String(id), customerId: 'cus_ann', plan: null, status: null, renewsAt: null })).json()).toMatchObject({ result: 'linked' });
    expect(await row('ann')).toMatchObject({ plan: 'free', stripe_customer_id: 'cus_ann' });
    expect(await (await hook({ id: 'evt_u', userId: '999999', customerId: 'cus_nobody' })).json()).toMatchObject({ result: 'unknown' });
  });

  it('answers 503 when billing is off', async () => {
    const { hook } = await start(null);
    expect((await hook({ id: 'evt_off' })).status).toBe(503);
  });
});

describe('Checkout and Portal', () => {
  it('is admin-only for now: a non-admin gets 403, and billing is not offered to them', async () => {
    const { as } = await start();
    expect((await as('ann', 'POST', '/api/billing/checkout', { interval: 'month' })).status).toBe(403);
    expect((await as('ann', 'POST', '/api/billing/portal', {})).status).toBe(403);
    expect((await (await as('ann', 'GET', '/api/me')).json() as { account: { billing: { available: boolean } } }).account.billing.available).toBe(false);
  });

  it('gives an admin a Checkout address for the chosen price, tied to their account', async () => {
    const { as, account } = await start();
    const id = await account('boss');
    expect(await (await as('boss', 'POST', '/api/billing/checkout', { interval: 'year' })).json()).toEqual({ ok: true, url: `https://checkout.example/${id}/new/price_y` });
    expect(await (await as('boss', 'POST', '/api/billing/checkout', { interval: 'month' })).json()).toMatchObject({ url: expect.stringMatching(/price_m$/) });
    expect((await (await as('boss', 'GET', '/api/me')).json() as { account: { billing: { available: boolean } } }).account.billing.available).toBe(true);
  });

  it('refuses an unknown interval, a plan nothing can be bought for, and a second subscription', async () => {
    const { as, account } = await start();
    await account('boss');
    expect((await as('boss', 'POST', '/api/billing/checkout', { interval: 'week' })).status).toBe(422);
    await owner.updateTable('users').set({ plan: 'founder' }).where('auth_user_id', '=', 'dev:boss').execute();
    expect((await as('boss', 'POST', '/api/billing/checkout', { interval: 'month' })).status).toBe(409);
    await owner.updateTable('users').set({ plan: 'paid', plan_source: 'stripe' }).where('auth_user_id', '=', 'dev:boss').execute();
    expect((await as('boss', 'POST', '/api/billing/checkout', { interval: 'month' })).status).toBe(409);
  });

  it('opens the Portal only for an account with a Stripe customer', async () => {
    const { as, account } = await start();
    await account('boss');
    expect((await as('boss', 'POST', '/api/billing/portal', {})).status).toBe(409);
    await owner.updateTable('users').set({ stripe_customer_id: 'cus_boss' }).where('auth_user_id', '=', 'dev:boss').execute();
    expect(await (await as('boss', 'POST', '/api/billing/portal', {})).json()).toEqual({ ok: true, url: 'https://portal.example/cus_boss' });
  });

  it('answers 503 and offers nothing when billing is off', async () => {
    const { as } = await start(null);
    expect((await as('boss', 'POST', '/api/billing/checkout', { interval: 'month' })).status).toBe(503);
    expect((await (await as('boss', 'GET', '/api/me')).json() as { account: { billing: { available: boolean } } }).account.billing.available).toBe(false);
  });
});

describe('deleting an account with a subscription', () => {
  it('ends the subscription first (deletes the Stripe customer), then deletes the account', async () => {
    const { as, account, row } = await start();
    await account('ann', 'paid', { stripe_customer_id: 'cus_ann', plan_source: 'stripe' });
    const res = await as('ann', 'POST', '/api/account/delete', { confirm: 'DELETE' });
    expect(res.status).toBe(200);
    expect(deleted).toEqual(['cus_ann']);
    expect(await row('ann')).toBeUndefined();
  });

  it('erases nothing, and says so, when Stripe cannot be reached', async () => {
    const { as, account, row } = await start();
    await account('ann', 'paid', { stripe_customer_id: 'cus_ann', plan_source: 'stripe' });
    deleteFails = true;
    const res = await as('ann', 'POST', '/api/account/delete', { confirm: 'DELETE' });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, error: expect.stringMatching(/nothing was deleted/) });
    expect(await row('ann')).toBeDefined();
  });

  it('treats a Stripe customer that is already gone as cancelled, so the account can still be deleted', async () => {
    const gone = Object.assign(new Error('No such customer'), { code: 'resource_missing' });
    const fake = { customers: { del: async () => { throw gone; } } } as unknown as Stripe;
    expect(await stripeApi(CONFIG, fake).deleteCustomer('cus_gone')).toBeUndefined();
    const down = { customers: { del: async () => { throw Object.assign(new Error('api down'), { code: 'api_connection_error' }); } } } as unknown as Stripe;
    await expect(stripeApi(CONFIG, down).deleteCustomer('cus_x')).rejects.toThrow('api down');
  });

  it('does not call Stripe for an account with no customer', async () => {
    const { as, account } = await start();
    await account('ann');
    expect((await as('ann', 'POST', '/api/account/delete', { confirm: 'DELETE' })).status).toBe(200);
    expect(deleted).toEqual([]);
  });
});
