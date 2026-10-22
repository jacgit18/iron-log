/* ---------- Who is signed in (B2e) ----------
   The things the account screen needs from the API: who am I, sign in with Google or an emailed code, sign out. Like the transport it never
   throws for a network problem: "can't tell" is an answer of its own, and must never read as "signed out". Browser calls are
   same-origin, so the API's Origin check passes and the session cookie travels without any extra setup. */

/** What /api/me says about billing (ADR 065): `available` is false when billing is off or not yet offered to this account. */
export interface BillingInfo {
  available: boolean;
  source: string;
  status: string | null;
  renewsAt: string | null;
  hasCustomer: boolean;
}

export type AccountState =
  | { status: 'signed-out' }
  | { status: 'signed-in'; userId: string; kind: 'session' | 'dev'; email: string | null; name: string | null; isAdmin: boolean; isPaid: boolean; plan?: string; billing?: BillingInfo }
  | { status: 'unreachable' };

/** `refused` is a code that is wrong, used or expired, or an address that is not one; `slow-down` is the rate limit. */
export type EmailCodeOutcome = 'ok' | 'refused' | 'slow-down' | 'unreachable';

export interface AccountOptions {
  baseUrl?: string;
  /** Sent on /api/me so a development build can name its dev user. Empty in production, which relies on the cookie. */
  headers?: () => Record<string, string>;
  fetch?: typeof fetch;
}

const asString = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function billingFrom(v: unknown): BillingInfo | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const b = v as Record<string, unknown>;
  return { available: b.available === true, source: asString(b.source) ?? 'manual', status: asString(b.status), renewsAt: asString(b.renewsAt), hasCustomer: b.hasCustomer === true };
}

export function createAccountClient(options: AccountOptions = {}) {
  const { baseUrl = '', headers } = options;
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function me(): Promise<AccountState> {
    try {
      const res = await doFetch(`${baseUrl}/api/me`, { headers: { accept: 'application/json', ...(headers?.() ?? {}) }, credentials: 'same-origin' });
      if (res.status === 401) return { status: 'signed-out' };
      if (!res.ok) return { status: 'unreachable' };
      const body = (await res.json().catch(() => undefined)) as { userId?: unknown; account?: { kind?: unknown; email?: unknown; name?: unknown; isAdmin?: unknown; isPaid?: unknown; plan?: unknown; billing?: unknown } } | undefined;
      const userId = asString(body?.userId);
      // An answer that is not what the API sends (a proxy page, a half-deployed API) says nothing about who is signed in.
      if (!userId) return { status: 'unreachable' };
      const plan = asString(body?.account?.plan);
      const billing = billingFrom(body?.account?.billing);
      return { status: 'signed-in', userId, kind: body?.account?.kind === 'dev' ? 'dev' : 'session', email: asString(body?.account?.email), name: asString(body?.account?.name), isAdmin: body?.account?.isAdmin === true, isPaid: body?.account?.isPaid === true, ...(plan ? { plan } : {}), ...(billing ? { billing } : {}) };
    } catch {
      return { status: 'unreachable' };
    }
  }

  /** Asks Better Auth for the Google sign-in address. The caller sends the browser there; it comes back to the app root. */
  async function startGoogleSignIn(): Promise<{ ok: true; url: string } | { ok: false; reason: 'unreachable' | 'refused' }> {
    try {
      const res = await doFetch(`${baseUrl}/api/auth/sign-in/social`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
      });
      if (!res.ok) return { ok: false, reason: res.status >= 500 || res.status === 429 ? 'unreachable' : 'refused' };
      const body = (await res.json().catch(() => undefined)) as { url?: unknown } | undefined;
      const url = asString(body?.url);
      return url ? { ok: true, url } : { ok: false, reason: 'refused' };
    } catch {
      return { ok: false, reason: 'unreachable' };
    }
  }

  /** Whether the emailed code is on for everyone. A server that cannot say (down, old, no sign-in) counts as no. */
  async function emailCodeOpen(): Promise<boolean> {
    try {
      const res = await doFetch(`${baseUrl}/api/auth-options`, { headers: { accept: 'application/json' }, credentials: 'same-origin' });
      if (!res.ok) return false;
      return ((await res.json().catch(() => undefined)) as { emailCode?: unknown } | undefined)?.emailCode === true;
    } catch {
      return false;
    }
  }

  const post = (path: string, body: unknown) =>
    doFetch(`${baseUrl}${path}`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });

  /** Asks for a code to be emailed. The server answers the same whether or not a mail went out, so `ok` means "asked", not "delivered". */
  async function sendEmailCode(email: string): Promise<EmailCodeOutcome> {
    try {
      const res = await post('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' });
      if (res.ok) return 'ok';
      return res.status === 429 ? 'slow-down' : res.status >= 500 ? 'unreachable' : 'refused';
    } catch {
      return 'unreachable';
    }
  }

  /** Checks the code. On success the session cookie is set and the caller reloads into the app. */
  async function signInWithEmailCode(email: string, otp: string): Promise<EmailCodeOutcome> {
    try {
      const res = await post('/api/auth/sign-in/email-otp', { email, otp });
      if (res.ok) return 'ok';
      return res.status === 429 ? 'slow-down' : res.status >= 500 ? 'unreachable' : 'refused';
    } catch {
      return 'unreachable';
    }
  }

  /** Billing (ADR 065): the address of Stripe's hosted Checkout or Customer Portal, which the caller sends the browser to. */
  async function billingUrl(path: '/api/billing/checkout' | '/api/billing/portal', body: unknown): Promise<{ ok: true; url: string } | { ok: false }> {
    try {
      const res = await doFetch(`${baseUrl}${path}`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', ...(headers?.() ?? {}) }, credentials: 'same-origin', body: JSON.stringify(body) });
      const url = res.ok ? asString(((await res.json().catch(() => undefined)) as { url?: unknown } | undefined)?.url) : null;
      return url ? { ok: true, url } : { ok: false };
    } catch {
      return { ok: false };
    }
  }
  const billingCheckout = (interval: 'month' | 'year') => billingUrl('/api/billing/checkout', { interval });
  const billingPortal = () => billingUrl('/api/billing/portal', {});

  async function signOut(): Promise<boolean> {
    try {
      const res = await doFetch(`${baseUrl}/api/auth/sign-out`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, credentials: 'same-origin', body: '{}' });
      return res.ok;
    } catch {
      return false;
    }
  }

  return { me, billingCheckout, billingPortal, startGoogleSignIn, emailCodeOpen, sendEmailCode, signInWithEmailCode, signOut };
}

export type AccountClient = ReturnType<typeof createAccountClient>;
