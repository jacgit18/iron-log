import { signIn } from '../sync/devUser.js';
import type { Issue, IssueCounts, IssueStatus } from '../types.ts';

// The admin Issues screen's calls to /api/issues (ADR 013 amendment). Nothing here is stored or synced: it is read from the server
// each time, and every failure comes back as a plain reason, never a throw, so the screen can say what happened.
export type IssuesFailure = { ok: false; reason: 'failed' | 'forbidden' | 'offline' };

const headers = () => ({ 'content-type': 'application/json', 'x-client-version': __APP_VERSION__, ...signIn() });

async function call(method: 'GET' | 'PATCH', path: string, body?: unknown): Promise<{ ok: true; json: unknown } | IssuesFailure> {
  let res: Response;
  try {
    res = await fetch(`/api/issues${path}`, { method, headers: headers(), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch { return { ok: false, reason: 'offline' }; }
  if (res.status === 403) return { ok: false, reason: 'forbidden' };
  if (!res.ok) return { ok: false, reason: 'failed' };
  try { return { ok: true, json: await res.json() }; } catch { return { ok: false, reason: 'failed' }; }
}

export async function listIssues(status: IssueStatus | null): Promise<{ ok: true; issues: Issue[]; counts: IssueCounts } | IssuesFailure> {
  const r = await call('GET', status ? `?status=${status}` : '');
  if (!r.ok) return r;
  const { issues, counts } = r.json as { issues?: Issue[]; counts?: IssueCounts };
  return Array.isArray(issues) && counts ? { ok: true, issues, counts } : { ok: false, reason: 'failed' };
}

export async function updateIssue(fingerprint: string, patch: { status?: IssueStatus; note?: string }): Promise<{ ok: true } | IssuesFailure> {
  const r = await call('PATCH', `/${fingerprint}`, patch);
  return r.ok ? { ok: true } : r;
}
