#!/usr/bin/env node
// Seeds the QA database with the test accounts in server/qa/personas.ts and their data (brief: qa-persona-picker).
//
//   QA_DATABASE_URL=<owner URL of the QA branch> node scripts/qa-seed.mjs --host <host> [--persona <id>] [--apply]
//
// Dry run unless --apply: prints what each account would get and changes nothing. With --apply, one transaction per account: the account is
// removed if it exists (auth user, session, and every row it owns) and made again, so a re-run puts each persona back to its starting state.
// Refuses unless the database carries the QA mark (scripts/qa-db.mjs reset sets it), so it cannot seed staging, production or a scratch copy.
// Names and emails are sealed with QA's own key, which only --apply needs: export it as QA_PII_ENCRYPTION_KEY (the value of the Secret Manager
// secret iron-log-qa-pii-key; never production's, whose rows QA could not open). The URL and the key are never printed.
// --host must be the host in the URL (typed on purpose), as in qa-db.mjs.
import { BUILTIN } from '../src/lib/data.ts';
import { createPiiCrypto, parsePiiKey } from '../server/auth/piiCrypto.ts';
import { PERSONAS, personaAuthId, personaEmail } from '../server/qa/personas.ts';
import { buildPersonaRows } from '../server/qa/seedPlan.ts';
import { connect, fail, guardHost, readMark } from './lib/db-script.mjs';

const MARKER = 'iron-log qa';
const BATCH = 500;
const args = process.argv.slice(2);
const flag = name => args.indexOf(name);
const value = name => (flag(name) >= 0 ? args[flag(name) + 1] : undefined);
const apply = args.includes('--apply');
const host = value('--host');
const only = value('--persona');
const url = process.env.QA_DATABASE_URL;

if (!url) fail('No QA_DATABASE_URL: set it to the owner URL of the QA branch.');
if (!host) fail('Usage: qa-seed.mjs --host <the host in QA_DATABASE_URL> [--persona <id>] [--apply]');
const chosen = only ? PERSONAS.filter(p => p.id === only) : PERSONAS;
if (!chosen.length) fail(`Unknown persona "${only}". Known: ${PERSONAS.map(p => p.id).join(', ')}`);
let crypto;
if (apply) {
  const key = parsePiiKey(process.env.QA_PII_ENCRYPTION_KEY);
  if ('error' in key) fail(`--apply needs QA's own key: ${key.error.replace('PII_ENCRYPTION_KEY', 'QA_PII_ENCRYPTION_KEY')}`);
  crypto = createPiiCrypto(key.key);
}
await guardHost(url, host, 'QA_DATABASE_URL');

const exerciseIds = [...new Set(['A', 'B'].flatMap(k => BUILTIN[k].days.flatMap(d => d.slots.flatMap(s => s.items.map(i => i.ex)))))];
const today = new Date();
const client = await connect(url, 'QA');
let code = 0;
try {
  const mark = await readMark(client);
  if (mark !== MARKER) fail(`This database is not marked as QA (mark: ${mark ?? 'none'}). Nothing was changed.`);
  console.log(`database host: ${new URL(url).hostname}`);
  for (const persona of chosen) {
    const rows = buildPersonaRows(persona, exerciseIds, today);
    console.log(`${apply ? 'seeding' : 'would seed'}: ${persona.id} (${persona.plan}${persona.planStatus ? `, ${persona.planStatus}` : ''}): ${rows.programs ? 2 : 0} programs, ${rows.logs.length} log entries, ${rows.body.length} body weights, ${rows.groceryItems.length} grocery items${rows.erased ? ', erased' : ''}`);
    if (apply) await seedOne(persona, rows);
  }
  if (!apply) console.log('Dry run. Add --apply to write these.');
} catch (e) {
  console.error(`Nothing more was changed: ${e instanceof Error ? e.message : String(e)}`);
  code = 1;
} finally {
  await client.end().catch(() => {});
}
process.exit(code);

async function seedOne(persona, rows) {
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
      for (const k of ['A', 'B']) await client.query('insert into programs (user_id, seq, key, data) values ($1, $2, $3, $4)', [u.id, ++seq, k, JSON.stringify(BUILTIN[k])]);
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
