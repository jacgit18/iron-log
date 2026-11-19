// The pure parts of scripts/db-sm.mjs: arguments, the secret's name per environment, the checks on a URL, and the child's environment.
// Nothing here reads a secret or opens a database itself: `check` takes the reading functions as arguments, so tests inject fakes. No message built here
// contains the URL (`redact` is the last step on anything that is shown).
export const ENVS = {
  qa: { secret: 'iron-log-qa-owner-database-url', mark: 'iron-log qa', prefix: 'QA' },
  staging: { secret: 'iron-log-staging-owner-database-url', mark: 'iron-log staging', prefix: 'STAGING' },
  production: { secret: 'iron-log-prod-owner-url', mark: null, prefix: 'PRODUCTION' },
};
const OTHER_MARKS = ['iron-log qa', 'iron-log staging']; // production must carry neither

// Database settings that must not reach the child: the one it is given is the only one it may use, so a stale one in the shell cannot win.
export const REFUSED = 64; // the wrapper's own refusal (nothing ran); a child's own exit status is passed through unchanged
export const STRIPPED = ['DATABASE_URL', 'BACKUP_DATABASE_URL', 'READER_DATABASE_URL', 'PGSSLMODE', 'PGSSLROOTCERT', 'DATABASE_URL_UNPOOLED', 'PROD_DATABASE_URL', 'STAGING_DATABASE_URL', 'QA_DATABASE_URL', 'QA_OWNER_DATABASE_URL', 'APP_DATABASE_URL', 'MIGRATIONS_CHECK_URL',
  'PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSERVICE', 'PGPASSFILE', 'PGSERVICEFILE', 'PGOPTIONS'];

export const USAGE = 'Usage: npm run db:sm -- <qa|staging|production> --host <host> -- <command...>\n'
  + '  Reads that environment\'s owner database URL from Secret Manager, checks it, and runs the command with it as DATABASE_URL (that command only).\n'
  + '  --host must be the host of the URL (typed on purpose). The URL is never printed.';

/** { env, host, command: [file, ...args] } from the arguments after `db:sm --`; throws the usage text on anything else. */
export function parseArgs(argv) {
  const sep = argv.indexOf('--');
  const head = sep === -1 ? argv : argv.slice(0, sep);
  const command = sep === -1 ? [] : argv.slice(sep + 1);
  const [env, ...flags] = head;
  if (!env || !Object.hasOwn(ENVS, env)) throw new Error(`Unknown environment "${env ?? ''}". ${USAGE}`);
  const i = flags.indexOf('--host');
  const host = i >= 0 ? flags[i + 1] : undefined;
  if (!host || host.startsWith('--')) throw new Error(`--host <the host in the ${env} secret> is required. ${USAGE}`);
  if (flags.length !== 2) throw new Error(`Unexpected argument before "--": ${flags.filter((f, n) => n !== i && n !== i + 1).join(' ')}. ${USAGE}`);
  if (!command.length || !command[0]) throw new Error(`No command after "--". ${USAGE}`);
  return { env, host, command };
}

/** Replaces the URL, its password and its user in a text, so a message can be shown safely. */
export function redact(text, url) {
  let out = String(text);
  const parts = [url];
  try {
    const u = new URL(url);
    for (const p of [u.password, u.username]) if (p) parts.push(p, safeDecode(p));
  } catch { /* not a URL: only the whole string is removed */ }
  for (const p of parts.filter(p => p && p.length > 2)) out = out.split(p).join('[hidden]');
  return out;
}
const safeDecode = s => { try { return decodeURIComponent(s); } catch { return s; } };

/** The host of a database URL for a message, or throws "not a database URL" (the secret's name only, never the value). */
export function urlProblem(url, name) {
  let u;
  try { u = new URL(url); } catch { return `The secret ${name} is not a database URL.`; }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') return `The secret ${name} is not a database URL.`;
  return null;
}

export const isPooled = host => /-pooler(?=\.)/.test(host);

/** The child's environment: the base, without any database setting, plus DATABASE_URL. */
export function childEnv(url, base = process.env) {
  const env = { ...base };
  for (const k of STRIPPED) delete env[k];
  env.DATABASE_URL = url;
  return env;
}

/**
 * Every check before the command runs. Throws an Error whose message never contains the URL. Returns { host, warnings }.
 * Injected: `notLocal(url)` (db-script's notLocalProblem: null for a local URL, text for a problem such as a host= parameter, else why it is not local), `host(url)` (the host the pg driver will use), `prodUrl()` (production's owner URL or null), `same(a, b)` (same server by name, alias or address),
 * `mark(url, env)` (the database's mark, opened and closed by the caller's function). A check that cannot run refuses.
 */
export async function check({ env, host: typed, url }, { host, prodUrl, same, mark, notLocal }) {
  const { secret, mark: want } = ENVS[env];
  const bad = urlProblem(url, secret);
  if (bad) throw new Error(bad);
  const actual = host(url);
  if (!actual) throw new Error(`The host in the secret ${secret} cannot be read. Nothing was run.`);
  const local = notLocal(url); // null when the URL is on this machine (reads host/hostaddr parameters too)
  if (local === null || local === undefined) throw new Error(`The secret ${secret} points at a database on this machine, not ${env}. Nothing was run.`);
  if (local && /parameter/.test(local)) throw new Error(`The secret ${secret} has a host= or hostaddr= parameter, which can send the connection to another machine. Nothing was run.`);
  if (actual !== typed.toLowerCase().replace(/\.+$/, '')) throw new Error(`--host ${typed} does not match the host in the secret ${secret} (${actual}). Nothing was run.`);
  const prod = prodUrl();
  if (!prod) throw new Error('Cannot tell which database is production: set PROD_DATABASE_URL, or sign in so iron-log-prod-owner-url can be read. Refusing, because this check cannot run. Nothing was run.');
  const prodHost = host(prod);
  if (!prodHost) throw new Error('The host of production\'s URL cannot be read. Refusing, because this check cannot run. Nothing was run.');
  const isProd = await same(prodHost, actual);
  if (env === 'production' && !isProd) throw new Error(`${actual} is not production's database (${prodHost}), so ${secret} cannot be used for production. Nothing was run.`);
  if (env !== 'production' && isProd) throw new Error(`${actual} is production's database (same host, or an alias or address of it), not ${env}. Nothing was run.`);
  const warnings = [];
  if (isPooled(actual)) {
    if (env === 'production') throw new Error(`${actual} is a pooled address. Migrations and owner work use the direct URL (no -pooler in the host). Nothing was run.`);
    warnings.push(`${actual} is a pooled address (-pooler); a tool that needs a real session (dbmate, pg_dump) wants the direct one.`);
  }
  const found = await mark(url, env);
  if (want) {
    if (found !== want) throw new Error(`The database at ${actual} does not carry the ${env} mark (${found ? `it is marked "${found}"` : 'no mark'}). Nothing was run.`);
  } else if (found && OTHER_MARKS.includes(found)) {
    throw new Error(`The database at ${actual} is marked "${found}", so it is not production. Nothing was run.`);
  }
  return { host: actual, warnings };
}
