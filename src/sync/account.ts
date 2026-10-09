/* ---------- Who is signed in (B2e) ----------
   The three things the account screen needs from the API: who am I, sign in with Google, sign out. Like the transport it never
   throws for a network problem: "can't tell" is an answer of its own, and must never read as "signed out". Browser calls are
   same-origin, so the API's Origin check passes and the session cookie travels without any extra setup. */

export type AccountState =
  | { status: 'signed-out' }
  | { status: 'signed-in'; userId: string; kind: 'session' | 'dev'; email: string | null; name: string | null; isAdmin: boolean }
  | { status: 'unreachable' };

export interface AccountOptions {
  baseUrl?: string;
  /** Sent on /api/me so a development build can name its dev user. Empty in production, which relies on the cookie. */
  headers?: () => Record<string, string>;
  fetch?: typeof fetch;
}

const asString = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function createAccountClient(options: AccountOptions = {}) {
  const { baseUrl = '', headers } = options;
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function me(): Promise<AccountState> {
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

  async function signOut(): Promise<boolean> {
    try {
      const res = await doFetch(`${baseUrl}/api/auth/sign-out`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, credentials: 'same-origin', body: '{}' });
      return res.ok;
    } catch {
      return false;
    }
  }

  return { me, startGoogleSignIn, signOut };
}

export type AccountClient = ReturnType<typeof createAccountClient>;
