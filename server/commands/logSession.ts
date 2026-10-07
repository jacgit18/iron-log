import { sql, type Selectable, type Transaction } from 'kysely';
import { validateLogSession, type LogSessionInput } from '../../src/shared/commands.ts';
import type { DB, LogEntries } from '../db/types.ts';

// ADR 003 and 008: one command, one transaction. A create carries baseVersion null; an edit carries the version the
// phone saw. A retry of a create returns the row it made. A stale edit, an edit of a deleted row or of a row that does
// not exist is refused with 409 and the current row, and every refusal is written to refused_writes (FM-22).

export type LogEntryRow = Selectable<LogEntries>;

export type LogSessionResult =
  | { status: 200 | 201; body: { rows: LogEntryRow[]; cursor: string } }
  | { status: 409 | 422; body: { refused: string; current: LogEntryRow | null } };

export interface Envelope {
  clientId: string;
  baseVersion: number | null;
  input: unknown;
}

// Checked by hand because the body is untrusted JSON; null means the envelope itself is malformed.
export function parseEnvelope(body: unknown): Envelope | null {
  if (!body || typeof body !== 'object') return null;
  const { clientId, baseVersion, input } = body as Record<string, unknown>;
  if (typeof clientId !== 'string' || clientId.length < 1 || clientId.length > 100) return null;
  if (baseVersion !== null && !(Number.isInteger(baseVersion) && (baseVersion as number) >= 1)) return null;
  return { clientId, baseVersion: baseVersion as number | null, input };
}

// The note is free text a person typed, so it is dropped from what refused_writes keeps.
function scrubbed(input: unknown): unknown {
  if (!input || typeof input !== 'object') return null;
  const { entry, ...rest } = input as { entry?: unknown };
  if (entry && typeof entry === 'object') {
    const { n: _note, ...entryRest } = entry as Record<string, unknown>;
    return { ...rest, entry: entryRest };
  }
  return rest;
}

function columns({ exerciseId, entry }: LogSessionInput) {
  return {
    exercise_id: exerciseId,
    d: entry.d,
    phase: entry.ph ?? null,
    weight_lb: entry.w ?? null,
    sets_count: entry.s ?? null,
    reps: entry.r ?? null,
    hold_sec: entry.sec ?? null,
    sets: entry.sets ? JSON.stringify(entry.sets) : null,
    note: entry.n ?? null,
    slot: entry.slot ?? null,
    wk: entry.wk ?? null,
    auto: false,
    client_updated_at: entry.updatedAt ?? null,
  };
}

async function refuse(trx: Transaction<DB>, userId: string, env: { clientId?: string; input: unknown }, reason: string, clientVersion: string | null) {
  await trx
    .insertInto('refused_writes')
    .values({
      user_id: userId,
      command: 'log-session',
      client_id: env.clientId ?? null,
      reason,
      payload: JSON.stringify(scrubbed(env.input)),
      client_version: clientVersion,
    })
    .execute();
}

export async function logSession(trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null): Promise<LogSessionResult> {
  const env = parseEnvelope(body);
  if (!env) {
    await refuse(trx, userId, { input: body }, 'bad-envelope', clientVersion);
    return { status: 422, body: { refused: 'bad-envelope', current: null } };
  }
  const input = validateLogSession(env.input);
  if (!input) {
    await refuse(trx, userId, env, 'invalid-input', clientVersion);
    return { status: 422, body: { refused: 'invalid-input', current: null } };
  }
  // A check-off is made by tick-card (Phase C), never by hand-logging.
  if (input.entry.auto) {
    await refuse(trx, userId, env, 'check-off-not-allowed', clientVersion);
    return { status: 422, body: { refused: 'check-off-not-allowed', current: null } };
  }

  // Locking the user row serializes this user's writes, so change_seq cannot hand out the same number twice.
  await sql`select 1 from users where id = ${userId} for update`.execute(trx);
  const existing = (await trx.selectFrom('log_entries').selectAll().where('user_id', '=', userId).where('client_id', '=', env.clientId).executeTakeFirst()) ?? null;

  const seq = async () => (await trx.updateTable('users').set({ change_seq: sql`change_seq + 1` }).where('id', '=', userId).returning('change_seq').executeTakeFirstOrThrow()).change_seq;

  if (env.baseVersion === null) {
    if (existing) return { status: 200, body: { rows: [existing], cursor: existing.seq } };
    const next = await seq();
    const row = await trx.insertInto('log_entries').values({ user_id: userId, client_id: env.clientId, seq: next, ...columns(input) }).returningAll().executeTakeFirstOrThrow();
    return { status: 201, body: { rows: [row], cursor: next } };
  }

  const refusal = !existing ? 'not-found' : existing.deleted_at ? 'deleted' : existing.version !== env.baseVersion ? 'stale' : null;
  if (refusal) {
    await refuse(trx, userId, env, refusal, clientVersion);
    return { status: 409, body: { refused: refusal, current: existing } };
  }
  const next = await seq();
  const row = await trx
    .updateTable('log_entries')
    .set({ ...columns(input), version: env.baseVersion + 1, seq: next, updated_at: sql`now()` })
    .where('id', '=', existing!.id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return { status: 200, body: { rows: [row], cursor: next } };
}
