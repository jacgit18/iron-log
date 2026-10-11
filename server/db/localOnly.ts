// Outside production the API must use a database on this machine. In development the X-Dev-User sign-in is on, so a dev server
// pointed at Neon (for example by an owner URL left in .env as DATABASE_URL) would let anyone at localhost read and write
// production, and as the owner it also bypasses row-level security. That is how a `dev:dev` account appeared in production on
// 2026-10-08. ALLOW_REMOTE_DATABASE=true is the deliberate way past it.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function remoteDatabaseProblem(url: string | undefined, env: string | undefined, allow: string | undefined): string | null {
  if (!url || env === 'production' || allow === 'true') return null;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return 'the database URL is not a valid URL';
  }
  if (LOCAL_HOSTS.has(host)) return null;
  return `NODE_ENV is ${env ? `"${env}"` : 'not set'} but the database is on ${host}, not this machine. Point DATABASE_URL (and APP_DATABASE_URL) at the local database, or set ALLOW_REMOTE_DATABASE=true if this is on purpose`;
}
