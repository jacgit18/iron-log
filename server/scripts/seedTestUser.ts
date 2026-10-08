import { sql, type Kysely, type Transaction } from 'kysely';
import type { DB } from '../db/types.ts';

// Build spec 6a, "Phase C, seeding the test user". Run by hand, never from an API route. Copies all libraries and
// experiments from one account to another so the test account starts with them: every saved version (library_items) and
// the stretch, stretch_experiment and experiment lists (list_items). It does not copy programs, log entries, weeks,
// body weights, config, supplement days, the supplement list or backup settings, so the test user starts with no program.
// The built-in exercise catalog is app code and needs no copying.
//
// Safe to re-run: a row is copied only when the test user has no row for the same client id (and list), counting a row the
// test user deleted, so a re-run never duplicates anything, never brings back what the test user removed, and never
// overwrites what they edited. The source account is only read. Without `apply` nothing is written.

export const SEEDED_LISTS = ['stretch', 'stretch_experiment', 'experiment'] as const;

export interface SeedOptions {
  /** auth_user_id of the account to copy from (it must exist). */
  from: string;
  /** auth_user_id of the test account (created blank when it does not exist yet, and only when `apply` is set). */
  to: string;
  apply: boolean;
}

export interface SeedResult {
  applied: boolean;
  targetCreated: boolean;
  libraryItems: { copied: number; skipped: number };
  listItems: { copied: number; skipped: number };
}

async function userId(trx: Transaction<DB>, authUserId: string) {
  return (await trx.selectFrom('users').select('id').where('auth_user_id', '=', authUserId).executeTakeFirst())?.id ?? null;
}

// Counts the source rows the target does not have yet. `targetId` is null when the target user does not exist.
async function countMissing(trx: Transaction<DB>, table: 'library_items' | 'list_items', fromId: string, targetId: string | null) {
  const listOnly = table === 'list_items' ? sql`and s.list in (${sql.join(SEEDED_LISTS)})` : sql``;
  const sameList = table === 'list_items' ? sql`and t.list = s.list` : sql``;
  const result = await sql<{ live: string; missing: string }>`
    select count(*) as live,
           count(*) filter (where not exists (
             select 1 from ${sql.table(table)} t
             where t.user_id = ${targetId ?? '0'} and t.client_id = s.client_id ${sameList})) as missing
    from ${sql.table(table)} s
    where s.user_id = ${fromId} and s.deleted_at is null ${listOnly}`.execute(trx);
  const { live, missing } = result.rows[0]!;
  return { live: Number(live), missing: Number(missing) };
}

export async function seedTestUser(db: Kysely<DB>, { from, to, apply }: SeedOptions): Promise<SeedResult> {
  if (from === to) throw new Error('--from and --to name the same account');
  return db.transaction().execute(async trx => {
    const fromId = await userId(trx, from);
    if (!fromId) throw new Error(`no account with auth_user_id "${from}"`);

    let toId = await userId(trx, to);
    const targetCreated = !toId && apply;
    if (targetCreated) {
      toId = (await trx.insertInto('users').values({ auth_user_id: to }).returning('id').executeTakeFirstOrThrow()).id;
    }
    // Locking the test user's row serializes this with their own writes, so change_seq cannot be handed out twice.
    if (toId) await sql`select 1 from users where id = ${toId} for update`.execute(trx);

    const library = await countMissing(trx, 'library_items', fromId, toId);
    const lists = await countMissing(trx, 'list_items', fromId, toId);
    const result: SeedResult = {
      applied: apply,
      targetCreated,
      libraryItems: { copied: library.missing, skipped: library.live - library.missing },
      listItems: { copied: lists.missing, skipped: lists.live - lists.missing },
    };
    if (!apply || (library.missing === 0 && lists.missing === 0)) return result;

    // One seq for the whole run, so the test user's first pull delivers everything together.
    const seq = (await trx.updateTable('users').set({ change_seq: sql`change_seq + 1` }).where('id', '=', toId!).returning('change_seq').executeTakeFirstOrThrow()).change_seq;
    await sql`
      insert into library_items (user_id, client_id, seq, schema_version, data)
      select ${toId}, s.client_id, ${seq}, s.schema_version, s.data
      from library_items s
      where s.user_id = ${fromId} and s.deleted_at is null
        and not exists (select 1 from library_items t where t.user_id = ${toId} and t.client_id = s.client_id)`.execute(trx);
    await sql`
      insert into list_items (user_id, list, client_id, position, seq, schema_version, data)
      select ${toId}, s.list, s.client_id, s.position, ${seq}, s.schema_version, s.data
      from list_items s
      where s.user_id = ${fromId} and s.deleted_at is null and s.list in (${sql.join(SEEDED_LISTS)})
        and not exists (select 1 from list_items t where t.user_id = ${toId} and t.list = s.list and t.client_id = s.client_id)`.execute(trx);
    return result;
  });
}
