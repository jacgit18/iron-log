-- migrate:up

-- The admin accounts screen (brief admin-accounts-screen, backlog B7). Expand only: a nullable column, one new table and new functions;
-- nothing existing changes, so the code can ship after this has run.
--   * users.suspended_at: set by an admin; the API refuses every call from a suspended account except its own status, erase and delete.
--   * admin_actions: one row per suspend or restore (who, whom, what, when; no personal data). Both ids are set null if the account is
--     deleted, so the log never blocks a delete-my-account. No policy and no grant: only the functions below, which run as the owner, touch it.
--   * ensure_user_state(): ensure_user() plus the suspended flag in the same round trip (session auth).
--   * list_accounts / set_account_suspended: each raises SQLSTATE 42501 unless the caller has users.is_admin (like list_issues).
alter table users add column suspended_at timestamptz null;

create table admin_actions (
  id             bigint generated always as identity primary key,
  admin_user_id  bigint null references users (id) on delete set null,
  target_user_id bigint null references users (id) on delete set null,
  action         text not null check (action in ('suspend', 'restore')),
  created_at     timestamptz not null default now()
);
create index admin_actions_created on admin_actions (created_at desc);
alter table admin_actions enable row level security;
revoke all on admin_actions from public;

create function ensure_user_state(p_auth_user_id text) returns table (id bigint, suspended boolean)
  language sql security definer set search_path = public, pg_temp as $$
  insert into users (auth_user_id) values (p_auth_user_id)
  on conflict (auth_user_id) do update set auth_user_id = excluded.auth_user_id
  returning users.id, users.suspended_at is not null
$$;
revoke all on function ensure_user_state(text) from public;
grant execute on function ensure_user_state(text) to ironlog_app;

-- One jsonb answer: counts over every account, the newest p_limit accounts (1 to 200) with the sealed email as stored (the server opens and
-- masks it, the database never returns a clear one), and the last 10 actions.
create function list_accounts(p_limit integer) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from users where id = nullif(current_setting('app.user_id', true), '')::bigint and is_admin) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'limit is 1 to 200' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'counts', (select jsonb_build_object(
        'total', greatest(count(*), (select count(*) from auth."user")), -- the sign-up cap counts auth."user"; a row here appears only at an account's first API call
        'paid', count(*) filter (where plan in ('paid', 'lifetime', 'founder')),
        'suspended', count(*) filter (where suspended_at is not null)) from users),
    'accounts', coalesce((select jsonb_agg(a order by a.created_at desc, a.id desc) from (
        select u.id, u.plan, u.is_admin as "isAdmin", u.created_at, u.suspended_at is not null as suspended, au.email as "sealedEmail", u.auth_user_id like 'dev:%' as dev
          from users u left join auth."user" au on au.id = u.auth_user_id
         order by u.created_at desc, u.id desc limit p_limit) a), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(x order by x.created_at desc, x.id desc) from (
        select id, action, admin_user_id as "adminId", target_user_id as "targetId", created_at from admin_actions order by created_at desc, id desc limit 10) x), '[]'::jsonb));
end
$$;
revoke all on function list_accounts(integer) from public;
grant execute on function list_accounts(integer) to ironlog_app;

-- 'done', 'unchanged' (already in that state: no second log row) or 'unknown' (no such account). An admin or the caller as target raises 22023.
create function set_account_suspended(p_target bigint, p_suspend boolean) returns text
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  caller bigint := nullif(current_setting('app.user_id', true), '')::bigint;
  was_suspended boolean;
  target_admin boolean;
begin
  if not exists (select 1 from users where id = caller and is_admin) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select suspended_at is not null, is_admin into was_suspended, target_admin from users where id = p_target for update;
  if not found then return 'unknown'; end if;
  if p_target = caller or target_admin then
    raise exception 'an admin account cannot be suspended' using errcode = '22023';
  end if;
  if was_suspended = p_suspend then return 'unchanged'; end if;
  update users set suspended_at = case when p_suspend then now() else null end where id = p_target;
  insert into admin_actions (admin_user_id, target_user_id, action) values (caller, p_target, case when p_suspend then 'suspend' else 'restore' end);
  return 'done';
end
$$;
revoke all on function set_account_suspended(bigint, boolean) from public;
grant execute on function set_account_suspended(bigint, boolean) to ironlog_app;

-- migrate:down

-- Rollback drops the log (the record of who suspended whom is lost) and the flag (every suspended account is restored by it).
drop function set_account_suspended(bigint, boolean);
drop function list_accounts(integer);
drop function ensure_user_state(text);
drop table admin_actions;
alter table users drop column suspended_at;
