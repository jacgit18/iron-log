import { execFile } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { destructiveReasons, runnableSql, upPart } from './migration-guard.mjs';

// The destructive-migration guard (brief production-migrates-in-deploy): safe migrations apply automatically, destructive ones stop the deploy.
const mig = (up, down = 'drop table if exists x;') => `-- migrate:up\n${up}\n\n-- migrate:down\n${down}\n`;

describe('upPart', () => {
  it('is the part between migrate:up and migrate:down, so the down part never counts', () => {
    expect(upPart(mig('create table a (id int);', 'drop table a;'))).toContain('create table a');
    expect(upPart(mig('create table a (id int);', 'drop table a;'))).not.toContain('drop table');
  });
});

describe('destructiveReasons', () => {
  it('lets additions through: tables, columns, indexes, functions, policies, grants', () => {
    for (const up of ['create table t (id int);', 'alter table t add column c text;', 'create index i on t (c);', 'grant select on t to app;', 'create policy p on t using (true);',
      'create or replace function f() returns int language sql as $$ select 1 $$;', 'drop index if exists i;', 'drop function f(int);', 'alter table t alter column c set default 1;',
      'alter table t drop constraint t_check; alter table t add constraint t_check check (a in (1, 2, 3));', 'alter table t alter column a drop default;', 'alter table t alter column a drop not null;', 'alter table t drop constraint k;'])
      expect(destructiveReasons(mig(up)), up).toEqual([]);
  });
  it('stops each destructive statement and says why', () => {
    expect(destructiveReasons(mig('drop table t;'))).toEqual(['drops a table']);
    expect(destructiveReasons(mig('alter table t drop column c;'))).toEqual(['drops a column']);
    expect(destructiveReasons(mig('alter table t drop c;'))).toEqual(['drops a column']); // COLUMN is optional in Postgres
    expect(destructiveReasons(mig('alter table t drop if exists c;'))).toEqual(['drops a column']); // COLUMN is optional with IF EXISTS too
    expect(destructiveReasons(mig('alter table t drop constraint k, drop c;'))).toEqual(['drops a column']);
    expect(destructiveReasons(mig('drop schema s cascade;'))).toEqual(['drops a schema']);
    expect(destructiveReasons(mig('truncate t;'))).toEqual(['truncates a table']);
    expect(destructiveReasons(mig('alter table t rename to u;'))).toEqual(['renames something']);
    expect(destructiveReasons(mig('alter table t rename column a to b;'))).toEqual(['renames something']);
    expect(destructiveReasons(mig('alter table t alter column a type bigint;'))).toEqual(['changes a column type']);
    expect(destructiveReasons(mig('alter table t alter column a set data type text;'))).toEqual(['changes a column type']);
    expect(destructiveReasons(mig("delete from t where a = 1;"))).toEqual(['deletes rows']);
    expect(destructiveReasons(mig('drop table a; truncate b;'))).toEqual(['drops a table', 'truncates a table']);
  });
  it('is case-insensitive and ignores comments, strings and function bodies, but not a do block', () => {
    expect(destructiveReasons(mig('DROP TABLE t;'))).toEqual(['drops a table']);
    expect(destructiveReasons(mig('-- drop table t;\n/* truncate t; */ create table u (id int);'))).toEqual([]);
    expect(destructiveReasons(mig("insert into log (msg) values ('drop table t; delete from x');"))).toEqual([]);
    expect(destructiveReasons(mig('create function f() returns void language plpgsql as $body$ begin delete from t; truncate u; end $body$;'))).toEqual([]);
    expect(destructiveReasons(mig('do $$ begin delete from t; end $$;'))).toEqual(['deletes rows']);
    expect(destructiveReasons(mig('do language plpgsql $body$ begin truncate t; end $body$;'))).toEqual(['truncates a table']);
  });
  it('does not count the down part', () => {
    expect(destructiveReasons(mig('create table t (id int);', 'drop table t; delete from u;'))).toEqual([]);
  });
});

describe('the real migrations', () => {
  it('flags none of the migrations already in db/migrations as destructive (they were all applied by hand once, and each is an addition or a check widening)', () => {
    const flagged = readdirSync('db/migrations').filter(f => destructiveReasons(readFileSync(join('db/migrations', f), 'utf8')).length);
    expect(flagged, `these existing migrations would stop an automatic deploy: ${flagged.join(', ')}`).toEqual([]);
  });
});

describe('the command', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const run = (...files) => new Promise(done => execFile('node', [resolve('scripts/migration-guard.mjs'), ...files], { encoding: 'utf8' }, (err, stdout, stderr) => done({ status: err ? Number(err.code ?? 1) : 0, out: stdout + stderr })));
  it('exits 0 for safe files, 1 naming the file and the reason for a destructive one, 2 for no files or an unreadable one', async () => {
    const ok = join(dir, '1_ok.sql'); const bad = join(dir, '2_bad.sql');
    writeFileSync(ok, mig('create table t (id int);')); writeFileSync(bad, mig('alter table t drop column c;'));
    expect((await run(ok)).status).toBe(0);
    const r = await run(ok, bad);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`${bad}: drops a column`);
    expect(r.out).not.toContain(ok);
    expect((await run()).status).toBe(2);
    expect((await run(join(dir, 'missing.sql'))).status).toBe(2);
  });
});
