import type { CommandName, ServerRow, SyncTable } from './types.js';

/* ---------- Talking to the API ----------
   One place that makes requests and turns every answer, including a failure, into a result the queue can act on.
   It never throws for a network or server problem: the queue must decide what to do (ADR 003, FM-02), and a thrown
   error is too easy to treat as "drop it".

   The classes tell the queue what to do:
     network, server, auth, outdated -> pause and try again later; never discard
     refused                         -> the server will not take this write as sent: quarantine it, never drop it
     conflict                        -> a 409: the row changed (stale), was deleted, or is missing; merge and resend */

export type FailureClass = 'network' | 'server' | 'auth' | 'outdated' | 'refused' | 'conflict';

/** What the API answers to a command: the rows it wrote and the user's cursor after it. */
export interface CommandRows {
  rows: ServerRow[];
  cursor: string;
}

export type CommandOutcome =
  | ({ ok: true; status: number } & CommandRows)
  | { ok: false; class: 'conflict'; status: 409; reason: 'stale' | 'deleted' | 'not-found' | string; current: ServerRow | null }
  | { ok: false; class: 'refused'; status: number; reason: string }
  | { ok: false; class: 'network' | 'server' | 'auth' | 'outdated'; status: number; retryAfterMs: number | null; message: string };

export type PullOutcome =
  | { ok: true; rows: (ServerRow & { table: SyncTable })[]; cursor: string; more: boolean }
  | { ok: false; class: 'network' | 'server' | 'auth' | 'outdated'; status: number; retryAfterMs: number | null; message: string };

/** The answer to the one-time upload of old data: all of it was taken, or none of it. */
export type ImportOutcome =
  | { ok: true; imported: Record<string, number>; total: number }
  | { ok: false; class: 'not-empty' }
  | { ok: false; class: 'refused'; reason: string; at: number | null; command: string | null }
  | { ok: false; class: 'network' | 'server' | 'auth' | 'outdated'; status: number; retryAfterMs: number | null; message: string };

export interface Envelope {
  clientId: string;
  baseVersion: number | null;
  input: unknown;
}

export interface TransportOptions {
  /** Sent on every request (ADR 003, FM-03), so the server can refuse a client that is too old. */
  clientVersion: string;
  /** Where the API is. Empty means the same origin, which is how the app is served (ADR 010). */
  baseUrl?: string;
  /** Extra headers, read at request time: the sign-in. Today the dev stub's header, later the session. */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  /** A request that takes longer than this counts as a network failure. Long on purpose: Cloud Run and Neon cold starts stack (ADR 010). */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RETRY_AFTER_MS = 5 * 60_000;

// "Retry-After" is seconds or a date. Anything unreadable is ignored; a huge value is capped.
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, MAX_RETRY_AFTER_MS);
  // An HTTP date starts with a day name; anything else (a negative number, nonsense) is ignored.
  if (!/^[A-Za-z]/.test(value)) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.min(Math.max(at - now, 0), MAX_RETRY_AFTER_MS);
}

type Pause = Extract<CommandOutcome, { class: 'network' | 'server' | 'auth' | 'outdated' }>;
const pause = (cls: Pause['class'], status: number, retryAfterMs: number | null, message: string): Pause => ({ ok: false, class: cls, status, retryAfterMs, message });

// A status the queue should wait on rather than act on.
function pauseFor(status: number, retryAfterMs: number | null): Pause | null {
  if (status === 401 || status === 403) return pause('auth', status, retryAfterMs, 'sign-in required');
  if (status === 426) return pause('outdated', status, retryAfterMs, 'this version of the app is too old');
  // 429 and 5xx are the server or its host struggling; 404 and 405 mean the route is not there yet (a deploy in progress).
  if (status === 429 || status === 404 || status === 405 || status >= 500) return pause('server', status, retryAfterMs, `server answered ${status}`);
  return null;
}

export function createTransport(options: TransportOptions) {
  const { clientVersion, baseUrl = '', headers, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  // Sends one request. Returns the response, or a network failure; the body is read by the caller.
  async function send(path: string, init: RequestInit): Promise<Response | Pause> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const extra = headers ? await headers() : {};
      return await doFetch(baseUrl + path, { ...init, headers: { accept: 'application/json', 'x-client-version': clientVersion, ...extra, ...(init.headers as Record<string, string> | undefined) }, signal: controller.signal });
    } catch (err) {
      return pause('network', 0, null, controller.signal.aborted ? `no answer in ${timeoutMs} ms` : err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  }

  const isPause = (r: Response | Pause): r is Pause => 'class' in r;

  async function json(res: Response): Promise<unknown> {
    try { return await res.json(); } catch { return undefined; }
  }

  async function command(name: CommandName, envelope: Envelope): Promise<CommandOutcome> {
    const res = await send(`/api/commands/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(envelope) });
    if (isPause(res)) return res;
    const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
    const waiting = pauseFor(res.status, retryAfter);
    if (waiting) return waiting;
    const body = (await json(res)) as Record<string, unknown> | undefined;
    if (res.status === 409) {
      const reason = typeof body?.refused === 'string' ? body.refused : 'stale';
      return { ok: false, class: 'conflict', status: 409, reason, current: (body?.current as ServerRow | null | undefined) ?? null };
    }
    if (res.ok) {
      // A success whose body is not what the API sends is a server problem (a proxy page, a half-deployed API): wait, never act on it.
      if (!body || !Array.isArray(body.rows) || typeof body.cursor !== 'string') return pause('server', res.status, retryAfter, 'unexpected answer');
      return { ok: true, status: res.status, rows: body.rows as ServerRow[], cursor: body.cursor };
    }
    // Any other 4xx (422 invalid, 400, 413): the server will not take this write as sent.
    return { ok: false, class: 'refused', status: res.status, reason: typeof body?.refused === 'string' ? body.refused : typeof body?.error === 'string' ? body.error : `status ${res.status}` };
  }

  async function pull(since: string, limit?: number): Promise<PullOutcome> {
    const query = `since=${encodeURIComponent(since)}${limit ? `&limit=${limit}` : ''}`;
    const res = await send(`/api/sync?${query}`, { method: 'GET' });
    if (isPause(res)) return res;
    const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
    const waiting = pauseFor(res.status, retryAfter);
    if (waiting) return waiting;
    const body = (await json(res)) as Record<string, unknown> | undefined;
    if (!res.ok || !body || !Array.isArray(body.rows) || typeof body.cursor !== 'string' || typeof body.more !== 'boolean') {
      // Reading is safe to repeat, so even a 400 waits instead of giving up.
      return pause('server', res.status, retryAfter, res.ok ? 'unexpected answer' : `server answered ${res.status}`);
    }
    return { ok: true, rows: body.rows as (ServerRow & { table: SyncTable })[], cursor: body.cursor, more: body.more };
  }

  // The one-time upload (Phase E). Never repeated on its own: a failure is reported, and the user decides.
  async function importLegacy(commands: readonly { name: CommandName; clientId: string; input: unknown }[]): Promise<ImportOutcome> {
    const body = { clientId: 'import-legacy', baseVersion: null, input: { commands: commands.map(({ name, clientId, input }) => ({ name, clientId, input })) } };
    const res = await send('/api/commands/import-legacy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (isPause(res)) return res;
    const waiting = pauseFor(res.status, parseRetryAfter(res.headers.get('retry-after')));
    if (waiting) return waiting;
    const answer = (await json(res)) as Record<string, unknown> | undefined;
    if (res.status === 201 && answer && typeof answer.total === 'number' && answer.imported && typeof answer.imported === 'object') {
      return { ok: true, imported: answer.imported as Record<string, number>, total: answer.total };
    }
    if (res.status === 409 && answer?.refused === 'account-not-empty') return { ok: false, class: 'not-empty' };
    if (res.ok) return pause('server', res.status, null, 'unexpected answer');
    return {
      ok: false, class: 'refused',
      reason: typeof answer?.refused === 'string' ? answer.refused : `status ${res.status}`,
      at: typeof answer?.at === 'number' ? answer.at : null,
      command: typeof answer?.command === 'string' ? answer.command : null,
    };
  }

  return { command, pull, importLegacy };
}

export type Transport = ReturnType<typeof createTransport>;
