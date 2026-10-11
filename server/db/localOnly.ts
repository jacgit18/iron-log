// Outside production the API must use a database on this machine. In development the X-Dev-User sign-in is on, so a dev server
// pointed at Neon (for example by an owner URL left in .env as DATABASE_URL) would let anyone at localhost read and write
// production, and as the owner it also bypasses row-level security. That is how a `dev:dev` account appeared in production on
// 2026-10-08. ALLOW_REMOTE_DATABASE=true is the deliberate way past it.
// The host is read the way pg reads it (pg-connection-string, which lets a ?host= parameter override the URL's host), then PGHOST, then
// pg's default (localhost). A host starting with / is a Unix socket on this machine.
import { parse } from 'pg-connection-string';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function remoteDatabaseProblem(url: string | undefined, env: string | undefined, allow: string | undefined, pgHost = process.env.PGHOST): string | null {
  if (!url || env === 'production' || allow === 'true') return null;
  if (!/^postgres(ql)?:\/\//i.test(url)) return 'the database URL is not a valid URL';
  let host: string;
  try {
    host = parse(url).host || pgHost || 'localhost';
  } catch {
    return 'the database URL is not a valid URL';
  }
  if (LOCAL_HOSTS.has(host) || host.startsWith('/')) return null;
  return `NODE_ENV is ${env ? `"${env}"` : 'not set'} but the database is on ${host}, not this machine. Point DATABASE_URL (and APP_DATABASE_URL) at the local database, or set ALLOW_REMOTE_DATABASE=true if this is on purpose`;
}
