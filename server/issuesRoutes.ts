import { Router } from 'express';
import { sql, type Kysely } from 'kysely';
import { inUserTransaction } from './auth.ts';
import type { DB } from './db/types.ts';
import { ISSUE_STATUSES as STATUSES, type IssueStatus } from '../src/shared/issues.ts';

// The admin Issues screen's API (ADR 013 amendment, step 3), mounted at /api/issues behind sign-in, requireAdmin and a per-user limit.
// Everything goes through list_issues / set_issue_status, which check users.is_admin again in the database; a refusal
// from there (SQLSTATE 42501) is answered 403, the same as a refusal here.

interface IssueRow {
  fingerprint: string;
  kind: string;
  message: string;
  top_frame: string;
  page: string;
  first_seen: Date | string;
  last_seen: Date | string;
  occurrences: string | number;
  first_version: string;
  last_version: string;
  status: string;
  note: string;
}

const iso = (t: Date | string) => (t instanceof Date ? t : new Date(t)).toISOString();
const toIssue = (r: IssueRow) => ({
  fingerprint: r.fingerprint, kind: r.kind, message: r.message, topFrame: r.top_frame, page: r.page,
  firstSeen: iso(r.first_seen), lastSeen: iso(r.last_seen), occurrences: Number(r.occurrences),
  firstVersion: r.first_version, lastVersion: r.last_version, status: r.status, note: r.note,
});

const isStatus = (v: unknown): v is IssueStatus => typeof v === 'string' && (STATUSES as readonly string[]).includes(v);

/** `?status=` (one of the four, or left out) and `?limit=` (1 to 200, default 100); null when either is not acceptable. */
export function parseListQuery(query: Record<string, unknown>): { status: IssueStatus | null; limit: number } | null {
  const { status, limit } = query;
  if (status !== undefined && !isStatus(status)) return null;
  if (limit !== undefined && !(typeof limit === 'string' && /^\d{1,3}$/.test(limit) && Number(limit) >= 1 && Number(limit) <= 200)) return null;
  return { status: (status as IssueStatus | undefined) ?? null, limit: limit === undefined ? 100 : Number(limit) };
}

/** `{ status?, note? }` with at least one of them; the note up to 2000 characters. Anything else is refused. */
export function parsePatch(body: unknown): { status: IssueStatus | null; note: string | null } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { status, note, ...rest } = body as Record<string, unknown>;
  if (Object.keys(rest).length > 0 || (status === undefined && note === undefined)) return null;
  if (status !== undefined && !isStatus(status)) return null;
  if (note !== undefined && (typeof note !== 'string' || note.length > 2000)) return null;
  return { status: (status as IssueStatus | undefined) ?? null, note: (note as string | undefined) ?? null };
}

const notAllowed = (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === '42501';

export function issuesRoutes({ db }: { db: Kysely<DB> }): Router {
  const router = Router();
  const asAdmin = <T>(userId: unknown, fn: Parameters<typeof inUserTransaction<T>>[2]) => inUserTransaction(db, String(userId), fn);

  router.get('/', async (req, res) => {
    const q = parseListQuery(req.query);
    if (!q) return void res.status(422).json({ ok: false, error: 'status is open, investigating, fixed or ignored; limit is 1 to 200' });
    try {
      const overview = await asAdmin(res.locals.userId, async trx =>
        (await sql<{ overview: { counts: Record<string, string | number>; issues: IssueRow[] } }>`select list_issues(${q.status}, ${q.limit}) as overview`.execute(trx)).rows[0]!.overview);
      const { issues, counts } = overview;
      const byStatus = Object.fromEntries(STATUSES.map(s => [s, 0])) as Record<IssueStatus, number>;
      for (const [status, n] of Object.entries(counts)) if (isStatus(status)) byStatus[status] = Number(n);
      res.json({ ok: true, counts: byStatus, issues: issues.map(toIssue) });
    } catch (err) {
      if (notAllowed(err)) return void res.status(403).json({ ok: false, error: 'not available' });
      throw err;
    }
  });

  router.patch('/:fingerprint', async (req, res) => {
    const fingerprint = req.params.fingerprint ?? '';
    const patch = parsePatch(req.body);
    if (!/^[0-9a-f]{12}$/.test(fingerprint) || !patch) return void res.status(422).json({ ok: false, error: 'send { status: open|investigating|fixed|ignored, note (up to 2000 characters) } for a 12-digit fingerprint' });
    try {
      const found = await asAdmin(res.locals.userId, async trx =>
        (await sql<{ set_issue_status: boolean }>`select set_issue_status(${fingerprint}, ${patch.status}, ${patch.note})`.execute(trx)).rows[0]?.set_issue_status === true);
      if (!found) return void res.status(404).json({ ok: false, error: 'no such issue' });
      res.json({ ok: true });
    } catch (err) {
      if (notAllowed(err)) return void res.status(403).json({ ok: false, error: 'not available' });
      throw err;
    }
  });

  return router;
}
