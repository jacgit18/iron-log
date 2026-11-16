import { signIn } from '../sync/devUser.js';
import { cleanAnswer, type LineMatch } from '../shared/ingredientMatch.js';

// Fill nutrition: the app's call to /api/ingredients/resolve (brief recipe-auto-nutrition). Nothing is stored; every failure comes back as a plain reason, never a throw. The answer is cleaned again here: the server's word is checked, not trusted.
export type ResolveFailure = { ok: false; reason: 'offline' | 'unavailable' } | { ok: false; reason: 'cap'; retryAfterSec: number | null };
export type Resolve = { ok: true; lines: LineMatch[]; left: number | null; max: number | null } | ResolveFailure;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function resolveLines(lines: string[], signal?: AbortSignal): Promise<Resolve> {
  let res: Response;
  try {
    res = await fetch('/api/ingredients/resolve', { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-version': __APP_VERSION__, ...signIn() }, body: JSON.stringify({ lines }), ...(signal ? { signal } : {}) });
  } catch { return { ok: false, reason: 'offline' }; }
  let body: Record<string, unknown> | null = null;
  try { body = (await res.json()) as Record<string, unknown>; } catch { /* a page or nothing: unavailable */ }
  if (res.status === 503 && body?.why === 'cap') return { ok: false, reason: 'cap', retryAfterSec: num(body.retryAfterSec) };
  if (!res.ok || !body) return fail(res.status, typeof body?.why === 'string' ? body.why : 'no reason given');
  const clean = cleanAnswer(body, lines);
  return clean ? { ok: true, lines: clean, left: num(body.left), max: num(body.max) } : fail(res.status, 'unreadable');
}

// The real status goes to the console (as food search does): it tells a missing key (503 no-key) from a route that is not mounted (404).
const fail = (status: number, why: string): ResolveFailure => {
  console.warn(`fill nutrition unavailable: status ${status}, ${why}`);
  return { ok: false, reason: 'unavailable' };
};
