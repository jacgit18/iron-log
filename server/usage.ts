import { createHmac } from 'node:crypto';
import type { RequestHandler } from 'express';
import { sql, type Kysely } from 'kysely';
import { USAGE_EVENTS, USAGE_MAX_COUNT, type UsageEvent } from '../src/shared/usage.ts';
import type { DB } from './db/types.ts';

// Opt-in anonymous usage counts (brief opt-in-usage-counts). A phone that has the switch on sends one small report a day to
// POST /api/usage: a random install id it made itself, the build, whether it runs inside the Android app, and counts of six named events.
// Anyone may send one (no sign-in, like /api/client-errors), so the body is tiny, rate-limited, and checked against a fixed shape: any other
// key, any other event name, a count outside 0 to 1000 and the report is refused. The id is turned into an HMAC here and only that is stored
// (usage_days, migration 20261028000001), so the table cannot be matched to a phone, and it has no user_id at all.

export interface ParsedUsage {
  id: string;
  version: string;
  fromApp: boolean;
  counts: Partial<Record<UsageEvent, number>>;
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The report, or null when it is not exactly the shape a phone sends. */
export function parseUsage(body: unknown): ParsedUsage | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { id, version, fromApp, counts, ...rest } = body as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return null;
  if (typeof id !== 'string' || !ID.test(id)) return null;
  if (typeof version !== 'string' || !/^[\w.-]{0,20}$/.test(version)) return null;
  if (typeof fromApp !== 'boolean') return null;
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return null;
  const clean: ParsedUsage['counts'] = {};
  for (const [name, n] of Object.entries(counts)) {
    if (!(USAGE_EVENTS as readonly string[]).includes(name)) return null;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > USAGE_MAX_COUNT) return null;
    clean[name as UsageEvent] = n;
  }
  return { id, version, fromApp, counts: clean };
}

/** The key that makes install hashes, derived from a secret the server already has, so no new secret is needed. Changing that secret starts new install ids (counts only). */
export function usageKeyFrom(secret: string | undefined): string | undefined {
  return secret ? createHmac('sha256', secret).update('loadbearer-usage-install-v1').digest('hex') : undefined;
}

export const installHash = (key: string, id: string) => createHmac('sha256', key).update(id).digest('hex');

export function usageRecord(db: Kysely<DB> | undefined, key: string | undefined): RequestHandler {
  return (req, res, next) => {
    if (!db || !key) return void res.status(503).json({ ok: false, error: 'not available' });
    const report = parseUsage(req.body);
    if (!report) return void res.status(422).json({ ok: false, error: 'not a usage report' });
    sql<{ record_usage: 'full' | 'ok' }>`select record_usage(${installHash(key, report.id)}, ${report.version}, ${report.fromApp}, ${JSON.stringify(report.counts)}::jsonb) as record_usage`
      .execute(db)
      .then(result => {
        // The table is at its cap, so this new install was not stored: say so, or a full table looks like a quiet system.
        if (result.rows[0]?.record_usage === 'full') console.error(JSON.stringify({ severity: 'ERROR', msg: 'usage-full' }));
        res.status(204).end();
      }, next);
  };
}
