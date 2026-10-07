import { sql, type Transaction } from 'kysely';
import { validateUntickCard } from '../../src/shared/commands.ts';
import type { DB } from '../db/types.ts';
import { lockUser, nextSeq, parseEnvelope, refuse, type LogEntryRow } from './support.ts';

// ADR 008 and backend-data-rules.md section 3, rules 1 and 7. Unticking a card tombstones its check-offs for the week,
// whatever exercise they are under (so one left under an exercise the card no longer has goes too). With removeLogged it
// also tombstones what was logged by hand for the card that week. All of it is one command with one seq, so the pull
// feed delivers it together. It targets rows by card and week, not by version, so it cannot be stale: running it again
// finds nothing live and returns no rows without moving the cursor.

export type UntickCardResult =
  | { status: 200; body: { rows: LogEntryRow[]; cursor: string } }
  | { status: 422; body: { refused: string; current: null } };

export async function untickCard(trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null): Promise<UntickCardResult> {
  const env = parseEnvelope(body);
  if (!env) {
    await refuse(trx, userId, 'untick-card', { input: body }, 'bad-envelope', clientVersion);
    return { status: 422, body: { refused: 'bad-envelope', current: null } };
  }
  const input = validateUntickCard(env.input);
  if (!input || env.baseVersion !== null) {
    await refuse(trx, userId, 'untick-card', env, 'invalid-input', clientVersion);
    return { status: 422, body: { refused: 'invalid-input', current: null } };
  }

  await lockUser(trx, userId);
  const live = () => {
    let q = trx.selectFrom('log_entries').select('id').where('user_id', '=', userId).where('slot', '=', input.slot).where('wk', '=', input.wk).where('deleted_at', 'is', null);
    // A whole-card untick takes any exercise's check-off; naming an exercise limits it to that one's rows (rule 7).
    if (input.exerciseId) q = q.where('exercise_id', '=', input.exerciseId);
    if (!input.removeLogged) q = q.where('auto', '=', true);
    return q;
  };
  const ids = (await live().execute()).map(r => r.id);
  if (!ids.length) {
    const user = await trx.selectFrom('users').select('change_seq').where('id', '=', userId).executeTakeFirstOrThrow();
    return { status: 200, body: { rows: [], cursor: user.change_seq } };
  }

  const seq = await nextSeq(trx, userId);
  const rows = await trx
    .updateTable('log_entries')
    .set({ deleted_at: sql`now()`, version: sql`version + 1`, seq, updated_at: sql`now()` })
    .where('id', 'in', ids)
    .returningAll()
    .execute();
  return { status: 200, body: { rows, cursor: seq } };
}
