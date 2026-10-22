import { gunzipSync, gzipSync } from 'node:zlib';
import express, { Router, type RequestHandler } from 'express';
import { sql, type Kysely } from 'kysely';
import { inUserTransaction, type Account } from './auth.ts';
import type { DB } from './db/types.ts';
import { isPaid } from './plan.ts';

// Server backup history (ADR 066, brief server-backup-history): the app uploads the same file Export all data makes, once a day, gzipped,
// and keeps the newest few days here so a cleared browser or a new phone can restore. Free accounts keep 7 days, paid and admin accounts 30.
// The limit is applied twice, on upload (older days are deleted) and on read (older days are not shown), so a paid account that falls back to
// free sees 7 days at once. Nothing here is synced data: no sequence numbers, no history, no tombstones. The routes sit behind sessionAuth
// and the database enforces whose rows these are (row-level security), so the user id is never an argument.

export const FREE_DAYS = 7;
export const PAID_DAYS = 30;
/** The largest stored (compressed) snapshot. A year of heavy use is a few hundred KB; this stops a loop or a bad client. */
export const MAX_BYTES = 1024 * 1024;
/** The largest file after unzipping, so a small zip bomb cannot make the server allocate gigabytes. */
const MAX_UNZIPPED = 24 * 1024 * 1024;
/** The same-day shrink guard as the browser copy (lib/autoBackup.ts): a small file does not replace a fuller one of the same day. */
export const SHRINK_FLOOR = 10;
export const SHRINK_RATIO = 0.5;

export const daysFor = (plan: string | null | undefined, admin: boolean): number => (isPaid(plan, admin) ? PAID_DAYS : FREE_DAYS);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const COUNT = /^\d{1,9}$/;
const DAY_MS = 86_400_000;

/** A calendar day in YYYY-MM-DD form that exists, or null. */
export function parseDay(value: unknown): string | null {
  if (typeof value !== 'string' || !DAY.test(value)) return null;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== value ? null : value;
}

/** The phone's own "today" can differ from the server's by a time zone; a day further away than that is a wrong clock or a forged date. */
export const dayIsNear = (day: string, now: number): boolean => Math.abs(Date.parse(`${day}T00:00:00Z`) - Math.floor(now / DAY_MS) * DAY_MS) <= 2 * DAY_MS;

/** Replace a stored copy only with one that holds at least half as much, so a wipe or a failed load cannot overwrite a good copy. */
export const shouldReplace = (stored: number | null, next: number): boolean => stored == null || stored < SHRINK_FLOOR || next >= stored * SHRINK_RATIO;

/** A data file the server will keep: gzip (or plain) JSON that is an Iron Log export. Returns the gzipped bytes to store, or why not. */
export function prepareFile(raw: Buffer, encoding: string): { ok: true; zipped: Buffer } | { ok: false; error: string } {
  let text: Buffer;
  try { text = encoding === 'gzip' ? gunzipSync(raw, { maxOutputLength: MAX_UNZIPPED }) : raw; } catch { return { ok: false, error: 'the body is not a gzip file' }; }
  try {
    const file: unknown = JSON.parse(text.toString('utf8'));
    if (!file || typeof file !== 'object' || Array.isArray(file) || (file as { app?: unknown }).app !== 'iron-log') return { ok: false, error: 'the body is not an Iron Log data file' };
  } catch { return { ok: false, error: 'the body is not valid JSON' }; }
  const zipped = encoding === 'gzip' ? raw : gzipSync(text);
  return zipped.length > MAX_BYTES ? { ok: false, error: 'the backup is too large' } : { ok: true, zipped };
}

export interface BackupsDeps {
  db: Kysely<DB>;
  now?: () => number;
}

interface Window { days: number }
async function windowFor(trx: Parameters<Parameters<typeof inUserTransaction>[2]>[0], account: Account): Promise<Window> {
  const { rows } = await sql<{ plan: string }>`select plan from users where id = current_setting('app.user_id')::bigint`.execute(trx);
  return { days: daysFor(rows[0]?.plan ?? 'free', account.isAdmin === true) };
}

/** `BACKUPS_OFF=true` switches the routes off (ADR 066): they answer 503 and the app skips the upload. Read per request, so it needs no restart to test. */
const killSwitch: RequestHandler = (_req, res, next) => {
  if (process.env.BACKUPS_OFF === 'true') { res.status(503).json({ ok: false, error: 'backups are switched off' }); return; }
  next();
};

export function backupsRoutes({ db, now = Date.now }: BackupsDeps): Router {
  const router = Router();
  router.use(killSwitch);

  // Which days are on the account, newest first, limited to what the plan keeps.
  router.get('/', async (_req, res) => {
    const userId = String(res.locals.userId);
    const out = await inUserTransaction(db, userId, async trx => {
      const { days } = await windowFor(trx, res.locals.account as Account);
      const { rows } = await sql<{ day: string; saved_at: string; entries: number; score: number }>`
        select to_char(day, 'YYYY-MM-DD') as day, saved_at, entries, score from backup_snapshots order by day desc limit ${days}`.execute(trx);
      return { days, backups: rows.map(r => ({ date: r.day, savedAt: new Date(r.saved_at).toISOString(), entries: r.entries, score: r.score })) };
    });
    res.set('Cache-Control', 'private, no-cache').json({ ok: true, ...out });
  });

  // One day's file, as the JSON the app would have downloaded. Only a day inside the plan's window is readable.
  router.get('/:day', async (req, res) => {
    const day = parseDay(req.params.day);
    if (!day) { res.status(400).json({ ok: false, error: 'day must be YYYY-MM-DD' }); return; }
    const userId = String(res.locals.userId);
    const data = await inUserTransaction(db, userId, async trx => {
      const { days } = await windowFor(trx, res.locals.account as Account);
      const { rows } = await sql<{ data: Buffer }>`
        select data from backup_snapshots where day = ${day}::date and day in (select day from backup_snapshots order by day desc limit ${days})`.execute(trx);
      return rows[0]?.data ?? null;
    });
    if (!data) { res.status(404).json({ ok: false, error: 'no backup for that day' }); return; }
    res.set('Cache-Control', 'private, no-store').type('application/json').send(gunzipSync(data, { maxOutputLength: MAX_UNZIPPED }));
  });

  // Today's file. The body is the gzipped export (x-backup-encoding: gzip) or the plain JSON (identity); the counts are the phone's own,
  // used only for the list and the shrink guard, never trusted for anything else.
  router.put('/:day', express.raw({ type: () => true, limit: MAX_BYTES }), async (req, res) => {
    const day = parseDay(req.params.day);
    const entries = req.get('x-backup-entries') ?? '';
    const score = req.get('x-backup-score') ?? '';
    const encoding = req.get('x-backup-encoding') ?? 'identity';
    const refuse = (status: number, error: string) => void res.status(status).json({ ok: false, error });
    if (!day || !dayIsNear(day, now())) return refuse(422, 'day must be today, as YYYY-MM-DD');
    if (!COUNT.test(entries) || !COUNT.test(score) || (encoding !== 'gzip' && encoding !== 'identity')) return refuse(422, 'x-backup-entries, x-backup-score and x-backup-encoding are required');
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return refuse(422, 'send the data file as the request body');
    const file = prepareFile(req.body, encoding);
    if (!file.ok) return refuse(file.error === 'the backup is too large' ? 413 : 422, file.error);
    const userId = String(res.locals.userId);
    const saved = await inUserTransaction(db, userId, async trx => {
      const { days } = await windowFor(trx, res.locals.account as Account);
      // The conflict clause carries the shrink guard, so two phones writing at once cannot race past it.
      const { rows } = await sql<{ id: string }>`
        insert into backup_snapshots (user_id, day, entries, score, size_bytes, data)
        values (current_setting('app.user_id')::bigint, ${day}::date, ${Number(entries)}, ${Number(score)}, ${file.zipped.length}, ${file.zipped})
        on conflict (user_id, day) do update set saved_at = now(), entries = excluded.entries, score = excluded.score, size_bytes = excluded.size_bytes, data = excluded.data
          where backup_snapshots.score < ${SHRINK_FLOOR} or excluded.score >= backup_snapshots.score * ${SHRINK_RATIO}::numeric
        returning id`.execute(trx);
      // Keep the newest `days` days (never more than the plan allows); the table's own row cap is the same number.
      await sql`delete from backup_snapshots where id not in (select id from backup_snapshots order by day desc limit ${days})`.execute(trx);
      return rows.length > 0;
    });
    res.json({ ok: true, saved });
  });

  return router;
}
