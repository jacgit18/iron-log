-- migrate:up

-- Database hardening (brief db-hardening; backlog "Database hardening, one migration" and the audit finding
-- erase-my-data-no-user-lock-concurrent-create-survives). Done in place: no table, column or row changes, and nothing here depends on the app.

-- 1. erase_my_data takes the user's row first. Every sync command locks that row before it writes (server/commands/support.ts), so with this
-- a write in flight finishes before the erase deletes, and one that starts after it waits for the erase. Without it a row written while the
-- erase ran could commit after the erase had already looked at that table and survive it. The body is the one from migration 20261022000002
-- plus the lock, and pg_temp last in the search_path (step 2 sets the same on every other function; create or replace keeps the grants).
create or replace function erase_my_data() returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid bigint := nullif(current_setting('app.user_id', true), '')::bigint;
begin
  if uid is null then raise exception 'erase_my_data: no signed-in user'; end if;
  perform 1 from users where id = uid for update;
  delete from log_entries where user_id = uid;
  delete from body_entries where user_id = uid;
  delete from weeks where user_id = uid;
  delete from stretch_weeks where user_id = uid;
  delete from supplement_days where user_id = uid;
  delete from programs where user_id = uid;
  delete from config where user_id = uid;
  delete from library_items where user_id = uid;
  delete from list_items where user_id = uid;
  delete from grocery_months where user_id = uid;
  delete from push_subscription where user_id = uid;
  delete from backup_snapshots where user_id = uid;
  delete from refused_writes where user_id = uid;
  delete from row_history where user_id = uid;
  update users set data_epoch = data_epoch + 1, change_seq = change_seq + 1 where id = uid;
end
$$;

-- 2. pg_temp last in the search_path of every security-definer function. Postgres looks in pg_temp first unless it is named, so a temp table
-- or function could stand in for a name one of these functions uses and run with the function owner's rights. A loop, so none is missed
-- (14 today, every one `search_path = public`); a test (server/db/hardening.test.ts) fails if a later migration adds one without it.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;

-- 3. Nobody gets to create temporary tables by default. The app role does not use them (searched the server, the app and the scripts).
-- The database owner keeps the right. The name differs per environment, hence current_database().
do $$
begin
  execute format('revoke temporary on database %I from public', current_database());
end $$;

-- migrate:down

do $$
begin
  execute format('grant temporary on database %I to public', current_database());
end $$;

-- erase_my_data as it was: no row lock, search_path public.
create or replace function erase_my_data() returns void
  language plpgsql security definer set search_path = public as $$
declare
  uid bigint := nullif(current_setting('app.user_id', true), '')::bigint;
begin
  if uid is null then raise exception 'erase_my_data: no signed-in user'; end if;
  delete from log_entries where user_id = uid;
  delete from body_entries where user_id = uid;
  delete from weeks where user_id = uid;
  delete from stretch_weeks where user_id = uid;
  delete from supplement_days where user_id = uid;
  delete from programs where user_id = uid;
  delete from config where user_id = uid;
  delete from library_items where user_id = uid;
  delete from list_items where user_id = uid;
  delete from grocery_months where user_id = uid;
  delete from push_subscription where user_id = uid;
  delete from backup_snapshots where user_id = uid;
  delete from refused_writes where user_id = uid;
  delete from row_history where user_id = uid;
  update users set data_epoch = data_epoch + 1, change_seq = change_seq + 1 where id = uid;
end
$$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef loop
    execute format('alter function %s set search_path = public', f.sig);
  end loop;
end $$;
