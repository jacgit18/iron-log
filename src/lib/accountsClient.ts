import { signIn } from '../sync/devUser.js';

// The admin accounts screen's calls to /api/accounts (brief admin-accounts-screen). Nothing here is stored or synced: it is read from the
// server each time, and every failure comes back as a plain reason, never a throw, so the screen can say what happened.
export type AccountsFailure = { ok: false; reason: 'failed' | 'forbidden' | 'offline' | 'refused' | 'gone' | 'unavailable' };

export interface AccountRow { id: string; label: string; plan: string; isAdmin: boolean; joined: string; suspended: boolean }
export interface AccountAction { id: string; action: 'suspend' | 'restore' | 'delete'; adminId: string | null; targetId: string | null; at: string }
export interface AccountsOverview { cap: number | null; counts: { total: number; paid: number; suspended: number }; accounts: AccountRow[]; actions: AccountAction[] }

const headers = () => ({ 'x-client-version': __APP_VERSION__, ...signIn() });

async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ ok: true; json: unknown } | AccountsFailure> {
  let res: Response;
  try {
    res = await fetch(`/api/accounts${path}`, { method, headers: body === undefined ? headers() : { ...headers(), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch { return { ok: false, reason: 'offline' }; }
  if (res.status === 403) return { ok: false, reason: 'forbidden' };
  if (res.status === 404) return { ok: false, reason: 'gone' };
  if (res.status === 422) return { ok: false, reason: 'refused' };
  if (res.status === 503) return { ok: false, reason: 'unavailable' };
  if (!res.ok) return { ok: false, reason: 'failed' };
  try { return { ok: true, json: await res.json() }; } catch { return { ok: false, reason: 'failed' }; }
}

export async function listAccounts(): Promise<{ ok: true; overview: AccountsOverview } | AccountsFailure> {
  const r = await call('GET', '');
  if (!r.ok) return r;
  const o = r.json as Partial<AccountsOverview>;
  return o.counts && Array.isArray(o.accounts) && Array.isArray(o.actions) ? { ok: true, overview: { cap: typeof o.cap === 'number' ? o.cap : null, counts: o.counts, accounts: o.accounts, actions: o.actions } } : { ok: false, reason: 'failed' };
}

export async function setSuspendedState(id: string, suspend: boolean): Promise<{ ok: true } | AccountsFailure> {
  const r = await call('POST', `/${encodeURIComponent(id)}/${suspend ? 'suspend' : 'restore'}`);
  return r.ok ? { ok: true } : r;
}

/** Deletes a suspended account for good. `confirm` is the account's own number; the server compares it again. */
export async function deleteAccount(id: string): Promise<{ ok: true } | AccountsFailure> {
  const r = await call('POST', `/${encodeURIComponent(id)}/delete`, { confirm: id });
  return r.ok ? { ok: true } : r;
}
