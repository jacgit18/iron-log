import { describe, expect, it } from 'vitest';
import { remoteDatabaseProblem } from './localOnly.ts';

const NEON = 'postgres://neondb_owner:x@ep-flat-bonus-b4gha6jz-pooler.c-6.us-east-2.aws.neon.tech/neondb';

describe('remoteDatabaseProblem', () => {
  it('refuses a remote database in development, in test and with NODE_ENV unset', () => {
    for (const env of ['development', 'test', undefined]) expect(remoteDatabaseProblem(NEON, env, undefined)).toMatch(/not this machine/);
  });
  it('does not name the credentials', () => {
    expect(remoteDatabaseProblem(NEON, 'development', undefined)).not.toMatch(/neondb_owner|:x@/);
  });
  it('allows a local database in any environment', () => {
    for (const host of ['127.0.0.1:5433', 'localhost', '[::1]:5432']) expect(remoteDatabaseProblem(`postgres://u:p@${host}/ironlog`, 'development', undefined)).toBeNull();
  });
  it('allows anything in production, with ALLOW_REMOTE_DATABASE=true, or with no database', () => {
    expect(remoteDatabaseProblem(NEON, 'production', undefined)).toBeNull();
    expect(remoteDatabaseProblem(NEON, 'development', 'true')).toBeNull();
    expect(remoteDatabaseProblem(undefined, 'development', undefined)).toBeNull();
  });
  it('reads the host the way pg does: a ?host= parameter wins over the URL', () => {
    expect(remoteDatabaseProblem('postgres://u:p@localhost/neondb?host=ep-x.c-6.us-east-2.aws.neon.tech', 'development', undefined, undefined)).toMatch(/ep-x\.c-6/);
  });
  it('treats a Unix socket as local, and falls back to PGHOST when the URL has no host', () => {
    expect(remoteDatabaseProblem('postgres:///ironlog?host=/var/run/postgresql', 'development', undefined, undefined)).toBeNull();
    expect(remoteDatabaseProblem('postgres:///ironlog', 'development', undefined, undefined)).toBeNull();
    expect(remoteDatabaseProblem('postgres:///ironlog', 'development', undefined, 'ep-x.neon.tech')).toMatch(/ep-x\.neon\.tech/);
    expect(remoteDatabaseProblem('postgres:///ironlog', 'development', undefined, '/tmp')).toBeNull();
  });
  it('refuses a URL it cannot read', () => {
    for (const bad of ['not a url', 'ep-x.neon.tech', 'postgres://u:p@[bad/x']) expect(remoteDatabaseProblem(bad, 'development', undefined)).toMatch(/not a valid URL/);
  });
});
