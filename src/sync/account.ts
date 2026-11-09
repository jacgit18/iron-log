/* ---------- Who is signed in (B2e) ----------
   The things the account screen needs from the API: who am I, sign in with Google or an emailed code, sign out. Like the transport it never
   throws for a network problem: "can't tell" is an answer of its own, and must never read as "signed out". Browser calls are
   same-origin, so the API's Origin check passes and the session cookie travels without any extra setup. */
import { setQa } from './qaState.js';
import { setSuspended } from './suspendedState.js';
import { setTerms } from './termsState.js';
import { TERMS_TICK_KEY } from '../lib/termsGate.js';
import { CURRENT_TERMS } from '../shared/termsVersion.js';
import { DEFAULT_TIMEOUT_MS } from './timeouts.js';

/** What /api/me says about billing (ADR 065): `available` is false when billing is off or not yet offered to this account. */
export interface BillingInfo {
  available: boolean;
  source: string;
  status: string | null;
  renewsAt: string | null;
  hasCustomer: boolean;
}

/** What /api/me says on a QA service only (brief qa-persona-picker): the name of the test account this session is, if it is one, and whether an admin may switch. */
export interface QaInfo { persona: string | null; canSwitch: boolean }
const qaFrom = (v: unknown): QaInfo | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const q = v as Record<string, unknown>;
  return { persona: asString(q.persona), canSwitch: q.canSwitch === true };
};

/** What /api/me says about the Terms and Privacy acceptance (brief terms-acceptance). Absent from an old server: that counts as accepted, so nothing is blocked. */
export interface TermsInfo { accepted: boolean; terms: string | null; privacy: string | null }
const termsFrom = (v: unknown): TermsInfo | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const t = v as Record<string, unknown>;
  if (typeof t.accepted !== 'boolean') return undefined;
  return { accepted: t.accepted, terms: asString(t.terms), privacy: asString(t.privacy) };
};

export type AccountState =
  | { status: 'signed-out' }
  | { status: 'signed-in'; userId: string; kind: 'session' | 'dev'; email: string | null; name: string | null; isAdmin: boolean; isPaid: boolean; plan?: string; billing?: BillingInfo; qa?: QaInfo; suspended?: true; terms?: TermsInfo }
  | { status: 'unreachable' };

/** `refused` is a code that is wrong, used or expired, or an address that is not one; `slow-down` is the rate limit. */
export type EmailCodeOutcome = 'ok' | 'refused' | 'slow-down' | 'unreachable';

export interface AccountOptions {
  baseUrl?: string;
  /** How long /api/me may take, answer and body together, before it counts as unreachable. Long on purpose, like the sync's (cold starts). */
  timeoutMs?: number;
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

/* The app asks /api/me from several places while it starts (the admin check in main.tsx, the header badge, panels): one request serves them all.
   Only the browser's own fetch shares (a test that passes `fetch` gets a client of its own). A request in flight is joined; a signed-in or signed-out
   answer is reused for a few seconds; "unreachable" is never kept, so a retry asks again. Signing in or out clears it. */
const ME_REUSE_MS = 3000;
let sharedMe: { key: string; promise: Promise<AccountState>; at: number } | null = null;
export function resetMeCache() { sharedMe = null; }

export function createAccountClient(options: AccountOptions = {}) {
  const { baseUrl = '', headers, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  /** `fresh` skips the reuse window (a deliberate re-check, such as the wait for a plan to turn paid after Checkout) but still joins nothing stale: it asks the server. */
  function me(opts: { fresh?: boolean } = {}): Promise<AccountState> {
    if (options.fetch) return meFetch();
    if (opts.fresh) resetMeCache();
    const key = `${baseUrl}|${JSON.stringify(headers?.() ?? {})}`;
    if (sharedMe && sharedMe.key === key && Date.now() - sharedMe.at < ME_REUSE_MS) return sharedMe.promise;
    const entry = { key, at: Date.now(), promise: meFetch() };
    entry.promise = entry.promise.then(state => { if (state.status === 'unreachable' && sharedMe === entry) sharedMe = null; return state; });
    sharedMe = entry;
    return entry.promise;
  }

  async function meFetch(): Promise<AccountState> {
    // The sign-in gate waits on this, so it must end: the timer runs until the body is read, and an abort at any point is "can't tell".
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(`${baseUrl}/api/me`, { headers: { accept: 'application/json', ...(headers?.() ?? {}) }, credentials: 'same-origin', signal: controller.signal });
      if (res.status === 401) { setQa(undefined); setSuspended(false); setTerms(null); return { status: 'signed-out' }; }
      if (!res.ok) return { status: 'unreachable' };
      const body = (await res.json().catch(() => undefined)) as { userId?: unknown; qa?: unknown; account?: { kind?: unknown; email?: unknown; name?: unknown; isAdmin?: unknown; isPaid?: unknown; plan?: unknown; billing?: unknown; suspended?: unknown; terms?: unknown } } | undefined;
      const userId = asString(body?.userId);
      // An answer that is not what the API sends (a proxy page, a half-deployed API) says nothing about who is signed in.
      if (!userId) return { status: 'unreachable' };
      const plan = asString(body?.account?.plan);
      const billing = billingFrom(body?.account?.billing);
      setQa(qaFrom(body?.qa));
      const suspended = body?.account?.suspended === true;
      setSuspended(suspended);
      const terms = termsFrom(body?.account?.terms);
      setTerms(terms ? { accepted: terms.accepted, stored: { terms: terms.terms, privacy: terms.privacy } } : null);
      if (!terms || terms.accepted) { try { sessionStorage.removeItem(TERMS_TICK_KEY); } catch { /* ignore */ } } // a signed-in account owes nothing: a remembered tick must not outlive it for the next account
      return { status: 'signed-in', userId, kind: body?.account?.kind === 'dev' ? 'dev' : 'session', email: asString(body?.account?.email), name: asString(body?.account?.name), isAdmin: body?.account?.isAdmin === true, isPaid: body?.account?.isPaid === true, ...(suspended ? { suspended: true as const } : {}), ...(terms ? { terms } : {}), ...(qaFrom(body?.qa) ? { qa: qaFrom(body?.qa) } : {}), ...(plan ? { plan } : {}), ...(billing ? { billing } : {}) };
    } catch {
      return { status: 'unreachable' };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Asks Better Auth for the Google sign-in address. The caller sends the browser there; it comes back to the app root. */
  async function startGoogleSignIn(): Promise<{ ok: true; url: string } | { ok: false; reason: 'unreachable' | 'refused' }> {
    resetMeCache();
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
    resetMeCache();
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

  /** Records that this account accepted the current Terms and Privacy Policy (brief terms-acceptance). `stale` means the server serves other versions: reload for the newer app. */
  async function acceptTerms(): Promise<'ok' | 'stale' | 'unreachable'> {
    try {
      const res = await doFetch(`${baseUrl}/api/terms/accept`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', ...(headers?.() ?? {}) }, credentials: 'same-origin', body: JSON.stringify(CURRENT_TERMS) });
      if (res.ok) { resetMeCache(); setTerms(null); return 'ok'; }
      return res.status === 409 ? 'stale' : 'unreachable';
    } catch {
      return 'unreachable';
    }
  }

  async function signOut(): Promise<boolean> {
    resetMeCache();
    try {
      const res = await doFetch(`${baseUrl}/api/auth/sign-out`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, credentials: 'same-origin', body: '{}' });
      return res.ok;
    } catch {
      return false;
    }
  }

  return { me, billingCheckout, billingPortal, startGoogleSignIn, emailCodeOpen, sendEmailCode, signInWithEmailCode, signOut, acceptTerms };
}

export type AccountClient = ReturnType<typeof createAccountClient>;
