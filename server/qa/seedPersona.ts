import type pg from 'pg';
import { BUILTIN } from '../../src/lib/data.ts';
import type { PiiCrypto } from '../auth/piiCrypto.ts';
import { personaAuthId, personaEmail, type Persona } from './personas.ts';
import type { PersonaRows } from './seedPlan.ts';

/* ---------- Writes one persona's account and rows (brief: qa-persona-picker; moved here from scripts/qa-seed.mjs) ----------
   One transaction: the account is removed if it exists (auth user, sessions, and every row it owns) and made again, so a re-run puts the persona back
   to its starting state. Used by the seed script and by the in-app reset route. The caller owns the connection and checks the QA mark first. */

const BATCH = 500;

export async function seedPersona(client: Pick<pg.PoolClient, 'query'>, crypto: PiiCrypto, persona: Persona, rows: PersonaRows, today: Date): Promise<void> {
  const authId = personaAuthId(persona.id);
  try {
    await client.query('begin');
    // Start clean: the sessions and accounts go with the auth user, every data row goes with the users row (on delete cascade).
    await client.query('delete from users where auth_user_id = $1', [authId]);
    await client.query('delete from auth."user" where id = $1', [authId]);
    await client.query(
      'insert into auth."user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt") values ($1, $2, $3, true, null, now(), now())',
      [authId, crypto.seal(persona.name), crypto.sealStable(personaEmail(persona.id))]);
    const renews = persona.renewsInDays === null ? null : new Date(today.getTime() + persona.renewsInDays * 86_400_000);
    const source = persona.plan === 'paid' ? 'stripe' : 'manual';
    const { rows: [u] } = await client.query(
      'insert into users (auth_user_id, plan, plan_source, plan_status, plan_renews_at, plan_updated_at, data_epoch) values ($1, $2, $3, $4, $5, now(), $6) returning id',
      [authId, persona.plan, source, persona.planStatus, renews, rows.erased ? 2 : 1]);
    let seq = 0;
    if (rows.programs) {
      for (const k of ['A', 'B'] as const) await client.query('insert into programs (user_id, seq, key, data) values ($1, $2, $3, $4)', [u.id, ++seq, k, JSON.stringify(BUILTIN[k])]);
    }
    for (let i = 0; i < rows.logs.length; i += BATCH) {
      const chunk = rows.logs.slice(i, i + BATCH).map(l => ({ ...l, seq: ++seq }));
      await client.query(
        `insert into log_entries (user_id, client_id, seq, exercise_id, d, phase, weight_lb, sets_count, reps, wk)
         select $1, r.client_id, r.seq, r.exercise_id, r.d, r.phase, r.weight_lb, r.sets_count, r.reps, r.wk
           from jsonb_to_recordset($2::jsonb) as r(client_id text, seq bigint, exercise_id text, d date, phase text, weight_lb numeric, sets_count int, reps numeric, wk date)`,
        [u.id, JSON.stringify(chunk.map(l => ({ client_id: l.clientId, seq: l.seq, exercise_id: l.exerciseId, d: l.d, phase: l.phase, weight_lb: l.weightLb, sets_count: l.setsCount, reps: l.reps, wk: l.wk })))]);
    }
    for (const b of rows.body) await client.query('insert into body_entries (user_id, seq, wk, d, weight_lb) values ($1, $2, $3, $4, $5)', [u.id, ++seq, b.wk, b.d, b.weightLb]);
    for (const s of rows.groceryStores) await client.query(`insert into list_items (user_id, seq, client_id, list, position, data) values ($1, $2, $3, 'grocery_store', $4, $5)`, [u.id, ++seq, s.clientId, s.position, JSON.stringify(s.data)]);
    for (const g of rows.groceryItems) await client.query(`insert into list_items (user_id, seq, client_id, list, position, data) values ($1, $2, $3, 'grocery_item', $4, $5)`, [u.id, ++seq, g.clientId, g.position, JSON.stringify(g.data)]);
    await client.query('update users set change_seq = $2 where id = $1', [u.id, seq]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw new Error(`${persona.id}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
