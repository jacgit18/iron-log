import { describe, expect, it } from 'vitest';
import { createAccountClient } from './account.js';

// What /api/me says about billing (ADR 065), and the two calls that send the browser to Stripe.
const respond = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const meBody = (billing?: unknown) => ({ ok: true, userId: 'u1', account: { kind: 'session', email: 'a@b.co', name: 'Ann', isAdmin: true, isPaid: false, plan: 'free', ...(billing === undefined ? {} : { billing }) } });

describe('me() and billing', () => {
  it('reads the plan and the billing summary', async () => {
    const c = createAccountClient({ fetch: respond(meBody({ available: true, source: 'stripe', status: 'active', renewsAt: '2027-01-15T12:00:00.000Z', hasCustomer: true })) as typeof fetch });
    expect(await c.me()).toMatchObject({ status: 'signed-in', plan: 'free', billing: { available: true, source: 'stripe', status: 'active', renewsAt: '2027-01-15T12:00:00.000Z', hasCustomer: true } });
  });
  it('treats an older server (no billing in the answer) as no billing, and a malformed one as not available', async () => {
    expect(await createAccountClient({ fetch: respond(meBody()) as typeof fetch }).me()).not.toHaveProperty('billing');
    expect(await createAccountClient({ fetch: respond(meBody({ available: 'yes' })) as typeof fetch }).me()).toMatchObject({ billing: { available: false, source: 'manual', hasCustomer: false } });
  });
});

describe('Checkout and Portal calls', () => {
  it('post the choice and return the address', async () => {
    const seen: Array<{ url: string; body: unknown }> = [];
    const fetcher = (async (url: string, init: RequestInit) => { seen.push({ url, body: JSON.parse(String(init.body)) }); return new Response(JSON.stringify({ ok: true, url: 'https://stripe.test/x' }), { status: 200 }); }) as unknown as typeof fetch;
    const c = createAccountClient({ fetch: fetcher });
    expect(await c.billingCheckout('month')).toEqual({ ok: true, url: 'https://stripe.test/x' });
    expect(await c.billingPortal()).toEqual({ ok: true, url: 'https://stripe.test/x' });
    expect(seen).toEqual([{ url: '/api/billing/checkout', body: { interval: 'month' } }, { url: '/api/billing/portal', body: {} }]);
  });
  it('answer "not ok" for a refusal, a missing address, or no network, and never throw', async () => {
    expect(await createAccountClient({ fetch: respond({ ok: false }, 409) as typeof fetch }).billingPortal()).toEqual({ ok: false });
    expect(await createAccountClient({ fetch: respond({ ok: true }) as typeof fetch }).billingPortal()).toEqual({ ok: false });
    expect(await createAccountClient({ fetch: (async () => { throw new Error('offline'); }) as unknown as typeof fetch }).billingCheckout('year')).toEqual({ ok: false });
  });
});
