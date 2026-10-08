// Proves that row-level security works through a connection pooler (Neon's pooled endpoint runs in transaction mode, where a
// session-level setting would leak to or vanish from the next user of the same server connection). The API relies on
// `set_config('app.user_id', id, true)`, which lasts for one transaction only; this checks that, under load, through the pooler.
//
// Usage (on a SCRATCH database or Neon branch, never production: it writes two test users and a few rows, and the restricted
// role cannot delete them):
//   APP_DATABASE_URL='postgres://ironlog_app:...@ep-...-pooler.../neondb?sslmode=require' node scripts/check-pooled-rls.mjs --scratch
// It connects only as the restricted role (migration 009), never as the owner.
import pg from 'pg';

if (!process.argv.includes('--scratch')) {
  console.error('Refusing to run without --scratch: this writes test users and rows. Use a scratch database or Neon branch, never production.');
  process.exit(2);
}
const url = process.env.APP_DATABASE_URL;
if (!url) {
  console.error('Set APP_DATABASE_URL to the restricted role\'s connection string (the pooled one, to test the pooler).');
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: url, max: 10 });
let failed = false;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) failed = true;
};

// Runs fn in one transaction that has said whose data it is, exactly as the API does.
async function asUser(id, fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('app.user_id', $1, true)`, [id]);
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

try {
  const me = (await pool.query(`select current_user as role, r.rolsuper, r.rolbypassrls from pg_roles r where r.rolname = current_user`)).rows[0];
  check('connected as a role that row-level security applies to', !me.rolsuper && !me.rolbypassrls, `role ${me.role}`);

  const ids = [];
  for (const name of ['pooled-check-a', 'pooled-check-b']) ids.push((await pool.query(`select ensure_user($1) as id`, [name])).rows[0].id);
  const [A, B] = ids;
  check('ensure_user makes two users through the pooler', A !== B);

  const stamp = Date.now();
  for (const [id, who] of [[A, 'a'], [B, 'b']]) {
    await asUser(id, c => c.query(
      `insert into log_entries (user_id, client_id, seq, exercise_id, d) values ($1, $2, 1, 'squat', '2026-10-05') on conflict do nothing`, [id, `pooled-${who}-${stamp}`]));
  }
  check('each user can write their own row', true);

  // Many transactions at once, on a pool smaller than the work, each saying a different user. Every one must see only its own rows,
  // and a transaction that says nothing must see nothing, whatever connection it lands on.
  let leaks = 0;
  let strangers = 0;
  const work = Array.from({ length: 120 }, (_, i) => async () => {
    const id = i % 2 ? A : B;
    const seen = await asUser(id, c => c.query(`select distinct user_id from log_entries`));
    if (seen.rows.some(r => r.user_id !== id)) leaks++;
    const bare = await pool.query(`select count(*)::int as n from log_entries`); // no user set on this transaction
    if (bare.rows[0].n !== 0) strangers++;
  });
  await Promise.all(work.map(f => f()));
  check('120 interleaved transactions saw only their own user\'s rows', leaks === 0, leaks ? `${leaks} saw someone else's` : '');
  check('a transaction that names nobody sees nothing, on any connection', strangers === 0, strangers ? `${strangers} saw rows` : '');

  const forged = await asUser(A, c => c.query(`insert into log_entries (user_id, client_id, seq, exercise_id, d) values ($1, 'forged', 1, 'squat', '2026-10-05')`, [B])).then(() => 'was allowed', e => e.message);
  check('a user cannot write a row for someone else', /row-level security/.test(forged), forged);
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  await pool.end();
}
console.log(failed ? '\nFAILED: do not rely on row-level security through this connection until this passes.' : '\nPassed.');
process.exit(failed ? 1 : 0);
