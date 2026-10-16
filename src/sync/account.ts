/* ---------- Who is signed in (B2e) ----------
   The things the account screen needs from the API: who am I, sign in with Google or an emailed code, sign out. Like the transport it never
   throws for a network problem: "can't tell" is an answer of its own, and must never read as "signed out". Browser calls are
   same-origin, so the API's Origin check passes and the session cookie travels without any extra setup. */

export type AccountState =
  | { status: 'signed-out' }
  | { status: 'signed-in'; userId: string; kind: 'session' | 'dev'; email: string | null; name: string | null; isAdmin: boolean }
  | { status: 'unreachable' };

/** `refused` is a code that is wrong, used or expired, or an address that is not one; `slow-down` is the rate limit. */
export type EmailCodeOutcome = 'ok' | 'refused' | 'slow-down' | 'unreachable';

export interface AccountOptions {
  baseUrl?: string;
  /** Sent on /api/me so a development build can name its dev user. Empty in production, which relies on the cookie. */
  headers?: () => Record<string, string>;
  fetch?: typeof fetch;
}

// Who-am-I checks that are in the air right now, by address. At startup the sign-in gate, the admin check, the sync adapter, the account badge
// and the Account panel each ask within the same second (5 requests on a phone); while one is waiting they share its answer. Only requests
// that overlap are shared (same fetch function, same address), so no answer is ever reused after it arrives.
const inFlight = new WeakMap<typeof fetch, Map<string, Promise<AccountState>>>();
const pageFetch: typeof fetch = (...args) => fetch(...args);

const asString = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function createAccountClient(options: AccountOptions = {}) {
  const { baseUrl = '', headers } = options;
  const doFetch = options.fetch ?? pageFetch;

  async function fetchMe(): Promise<AccountState> {
    try {
      const res = await doFetch(`${baseUrl}/api/me`, { headers: { accept: 'application/json', ...(headers?.() ?? {}) }, credentials: 'same-origin' });
      if (res.status === 401) return { status: 'signed-out' };
      if (!res.ok) return { status: 'unreachable' };
      const body = (await res.json().catch(() => undefined)) as { userId?: unknown; account?: { kind?: unknown; email?: unknown; name?: unknown; isAdmin?: unknown } } | undefined;
      const userId = asString(body?.userId);
      // An answer that is not what the API sends (a proxy page, a half-deployed API) says nothing about who is signed in.
      if (!userId) return { status: 'unreachable' };
      return { status: 'signed-in', userId, kind: body?.account?.kind === 'dev' ? 'dev' : 'session', email: asString(body?.account?.email), name: asString(body?.account?.name), isAdmin: body?.account?.isAdmin === true };
    } catch {
      return { status: 'unreachable' };
    }
  }

  function me(): Promise<AccountState> {
    const mine = inFlight.get(doFetch) ?? new Map<string, Promise<AccountState>>();
    inFlight.set(doFetch, mine);
    let pending = mine.get(baseUrl);
    if (!pending) {
      pending = fetchMe().finally(() => { mine.delete(baseUrl); });
      mine.set(baseUrl, pending);
    }
    return pending;
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

  async function signOut(): Promise<boolean> {
    try {
      const res = await doFetch(`${baseUrl}/api/auth/sign-out`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, credentials: 'same-origin', body: '{}' });
      return res.ok;
    } catch {
      return false;
    }
  }

  return { me, startGoogleSignIn, emailCodeOpen, sendEmailCode, signInWithEmailCode, signOut };
}

export type AccountClient = ReturnType<typeof createAccountClient>;
