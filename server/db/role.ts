import { sql, type Kysely } from 'kysely';
import type { DB } from './types.ts';

/* ---------- Is row-level security actually protecting anything? ----------
   Row-level security does not apply to a superuser, to a role with BYPASSRLS, or to the owner of a table. If the API
   connected as one of those, every policy would silently do nothing and the only protection left would be the code. So the
   API checks which role it is, at startup, and outside development and test refuses to run as one of them (migration 009). */

export interface DbRole {
  role: string;
  superuser: boolean;
  bypassRls: boolean;
  /** Owns the data tables, so policies do not apply to it unless they are forced. */
  ownsTables: boolean;
}

export async function describeDbRole(db: Kysely<DB>): Promise<DbRole> {
  const { rows } = await sql<{ role: string; superuser: boolean; bypassrls: boolean; owns: boolean }>`
    select current_user as role, r.rolsuper as superuser, r.rolbypassrls as bypassrls,
           exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'log_entries' and tableowner = current_user) as owns
      from pg_roles r where r.rolname = current_user`.execute(db);
  const row = rows[0]!;
  return { role: row.role, superuser: row.superuser, bypassRls: row.bypassrls, ownsTables: row.owns };
}

/** Why row-level security would not apply to this role, or null when it does. */
export function rlsProblem(r: DbRole): string | null {
  if (r.superuser) return `the database role "${r.role}" is a superuser, so row-level security does not apply to it`;
  if (r.bypassRls) return `the database role "${r.role}" has BYPASSRLS, so row-level security does not apply to it`;
  if (r.ownsTables) return `the database role "${r.role}" owns the tables, so row-level security does not apply to it`;
  return null;
}

/** Throws in production; elsewhere returns the problem so it can be logged (local development connects as a superuser).
 *  The database may be asleep (Neon scales to zero), so a failure to connect is retried before it counts. */
export async function checkDbRole(db: Kysely<DB>, env: string | undefined, attempts = 5, pauseMs = 1000): Promise<string | null> {
  let role: DbRole | undefined;
  for (let i = 1; !role; i++) {
    try {
      role = await describeDbRole(db);
    } catch (err) {
      if (i >= attempts) {
        if (env === 'production') throw new Error(`Refusing to start: could not check which database role this is (${err instanceof Error ? err.message : String(err)})`);
        return `could not check which database role this is (${err instanceof Error ? err.message : String(err)})`;
      }
      await new Promise(r => setTimeout(r, pauseMs));
    }
  }
  const problem = rlsProblem(role);
  if (problem && env === 'production') {
    throw new Error(`Refusing to start: ${problem}. Connect the API as the restricted role (ironlog_app), not the role that runs migrations.`);
  }
  return problem;
}
