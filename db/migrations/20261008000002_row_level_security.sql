-- migrate:up

-- Migration 009: row-level security (ADR 004, data model). Every row is reachable only by its owner, enforced by the
-- database, so a bug in the API cannot leak another user's data.
--
-- Two roles. The one that runs migrations owns the tables and is not restricted (it is what migrations, seed-test-user and
-- the admin path use). `ironlog_app` is what the API connects as: it does not own anything, cannot bypass row-level
-- security, and sees nothing unless the request has said whose data it is (`app.user_id`, set per transaction by
-- inUserTransaction). It is created here without a login or a password. To let the API connect, an operator makes it
-- loginable by hand, once per database: ALTER ROLE ironlog_app LOGIN PASSWORD '...'  (never in a migration).
--
-- What the app role may do:
--   * the data tables: read, insert and update the caller's own rows. NO delete: rows are soft-deleted (tombstones), so a
--     hard delete is the admin path's job, never the API's.
--   * users: read the caller's own row and update only change_seq. It cannot insert users or touch is_admin; a user row is
--     made by ensure_user() below.
--   * refused_writes: insert the caller's own rows. row_history: nothing (the history trigger writes it as the owner).
--   * Better Auth's tables in the `auth` schema: full access, because Better Auth runs in the API process and has no
--     user_id to restrict by. (Splitting that into a second role is possible later.)
-- A new table in a later migration must enable row-level security, add its policy and grant what it needs; a test
-- (server/db/rls.test.ts) fails if one is forgotten.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ironlog_app') then
    create role ironlog_app nologin;
  end if;
end
$$;

grant usage on schema public to ironlog_app;
grant usage on schema auth to ironlog_app;
grant select, insert, update, delete on all tables in schema auth to ironlog_app;

-- The data tables and the policy that scopes them.
do $$
declare
  t text;
begin
  foreach t in array array['log_entries', 'body_entries', 'weeks', 'stretch_weeks', 'supplement_days', 'programs', 'config', 'library_items', 'list_items']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update on %I to ironlog_app', t);
    execute format(
      'create policy own_rows on %I to ironlog_app using (user_id = nullif(current_setting(''app.user_id'', true), '''')::bigint) with check (user_id = nullif(current_setting(''app.user_id'', true), '''')::bigint)',
      t);
  end loop;
end
$$;

-- Refusals are written by the API, never read by it.
alter table refused_writes enable row level security;
grant insert on refused_writes to ironlog_app;
create policy own_rows on refused_writes to ironlog_app
  using (user_id = nullif(current_setting('app.user_id', true), '')::bigint)
  with check (user_id = nullif(current_setting('app.user_id', true), '')::bigint);

-- History is written by the trigger, which now runs as the table owner so the app role needs no access to it.
alter table row_history enable row level security;
alter function record_row_history() security definer;
alter function record_row_history() set search_path = public;

-- Users: your own row, and only the change counter may change.
alter table users enable row level security;
grant select on users to ironlog_app;
grant update (change_seq) on users to ironlog_app;
create policy own_row on users to ironlog_app
  using (id = nullif(current_setting('app.user_id', true), '')::bigint)
  with check (id = nullif(current_setting('app.user_id', true), '')::bigint);

-- Finds or makes the user row for a Better Auth user id. It runs as the owner because the row cannot exist, and so cannot
-- be visible to its owner, until it has been made. The no-op update lets RETURNING work on a conflict.
create function ensure_user(p_auth_user_id text) returns bigint
  language sql security definer set search_path = public as $$
  insert into users (auth_user_id) values (p_auth_user_id)
  on conflict (auth_user_id) do update set auth_user_id = excluded.auth_user_id
  returning id
$$;
revoke all on function ensure_user(text) from public;
grant execute on function ensure_user(text) to ironlog_app;

-- Identity columns draw from sequences.
grant usage, select on all sequences in schema public to ironlog_app;

-- migrate:down

revoke usage, select on all sequences in schema public from ironlog_app;
revoke execute on function ensure_user(text) from ironlog_app;
drop function ensure_user(text);

drop policy own_row on users;
revoke update (change_seq) on users from ironlog_app;
revoke select on users from ironlog_app;
alter table users disable row level security;

alter function record_row_history() reset search_path;
alter function record_row_history() security invoker;
alter table row_history disable row level security;

drop policy own_rows on refused_writes;
revoke insert on refused_writes from ironlog_app;
alter table refused_writes disable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['log_entries', 'body_entries', 'weeks', 'stretch_weeks', 'supplement_days', 'programs', 'config', 'library_items', 'list_items']
  loop
    execute format('drop policy own_rows on %I', t);
    execute format('revoke select, insert, update on %I from ironlog_app', t);
    execute format('alter table %I disable row level security', t);
  end loop;
end
$$;

revoke select, insert, update, delete on all tables in schema auth from ironlog_app;
revoke usage on schema auth from ironlog_app;
revoke usage on schema public from ironlog_app;
-- The role itself stays: roles belong to the whole server, not one database, so dropping it here could break another database's grants.
