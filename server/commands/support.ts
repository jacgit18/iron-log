import { sql, type Selectable, type Transaction } from 'kysely';
import type { BodyEntries, Config, DB, GroceryMonths, LibraryItems, ListItems, LogEntries, Programs, StretchWeeks, SupplementDays, Weeks } from '../db/types.ts';

// Shared by the command handlers (ADR 008): the request envelope, the refused_writes record and the per-user cursor.

export type LogEntryRow = Selectable<LogEntries>;
export type BodyEntryRow = Selectable<BodyEntries>;
export type SupplementDayRow = Selectable<SupplementDays>;
export type WeekRow = Selectable<Weeks>;
export type ProgramRow = Selectable<Programs>;
export type ConfigRow = Selectable<Config>;
export type LibraryItemRow = Selectable<LibraryItems>;
export type ListItemRow = Selectable<ListItems>;
export type StretchWeekRow = Selectable<StretchWeeks>;
export type GroceryMonthRow = Selectable<GroceryMonths>;

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

// refused_writes is a diagnostic: a refused write was invalid, so what is kept is the start of it, not all of it (an account could otherwise fill the table
// at the command rate limit: code audit S-03). A NUL byte (\u0000) is replaced because jsonb cannot store it, which made the insert itself fail (S-04).
export const REFUSED_PAYLOAD_MAX = 1000;
export function refusedPayload(input: unknown): string {
  const text = (JSON.stringify(scrubbed(input)) ?? 'null').replace(/\\u0000/g, '\\ufffd');
  return text.length <= REFUSED_PAYLOAD_MAX ? text : JSON.stringify({ truncated: true, size: text.length, head: text.slice(0, REFUSED_PAYLOAD_MAX - 100) });
}

export async function refuse(trx: Transaction<DB>, userId: string, command: string, env: { clientId?: string; input: unknown }, reason: string, clientVersion: string | null) {
  await trx
    .insertInto('refused_writes')
    .values({
      user_id: userId,
      command,
      client_id: env.clientId ? env.clientId.replace(/\u0000/g, '\ufffd') : null,
      reason,
      payload: refusedPayload(env.input),
      client_version: clientVersion ? clientVersion.slice(0, 100) : null,
    })
    .execute();
}


// Locking the user row serializes this user's writes, so change_seq cannot hand out the same number twice.
export async function lockUser(trx: Transaction<DB>, userId: string): Promise<void> {
  await sql`select 1 from users where id = ${userId} for update`.execute(trx);
}

export async function nextSeq(trx: Transaction<DB>, userId: string): Promise<string> {
  return (await trx.updateTable('users').set({ change_seq: sql`change_seq + 1` }).where('id', '=', userId).returning('change_seq').executeTakeFirstOrThrow()).change_seq;
}
