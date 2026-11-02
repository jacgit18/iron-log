-- migrate:up

-- Admin delete (brief admin-delete-account, follow-up to admin-accounts-screen). Additive: a wider check and two new functions.
--   * admin_actions.action may now be 'delete'. The log row is written before the account goes; its target id is then set null by the foreign key.
--   * admin_account_for_delete(): what the server needs before deleting (sealed email for the emailed-code purge, Stripe customer id, flags).
--   * admin_delete_account(): the body of delete_my_account() (migration 20261008000003) for another account. It is a copy, not a refactor, so the
--     self-service function and its tests stay as they are; server/db/rls.test.ts checks both leave no row in any table with a user_id column.
-- Each raises SQLSTATE 42501 unless the caller has users.is_admin; 22023 for the caller, another admin, or an account that is not suspended.
alter table admin_actions drop constraint admin_actions_action_check;
alter table admin_actions add constraint admin_actions_action_check check (action in ('suspend', 'restore', 'delete'));

create function admin_account_for_delete(p_target bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  caller bigint := nullif(current_setting('app.user_id', true), '')::bigint;
  found_row record;
begin
  if not exists (select 1 from users where id = caller and is_admin) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select u.is_admin, u.suspended_at is not null as suspended, u.stripe_customer_id, au.email as sealed_email
    into found_row from users u left join auth."user" au on au.id = u.auth_user_id where u.id = p_target;
  if not found then return null; end if;
  if p_target = caller or found_row.is_admin then
    raise exception 'an admin account cannot be deleted' using errcode = '22023';
  end if;
  if not found_row.suspended then
    raise exception 'suspend the account first' using errcode = '22023';
  end if;
  return jsonb_build_object('sealedEmail', found_row.sealed_email, 'stripeCustomerId', found_row.stripe_customer_id);
end
$$;
revoke all on function admin_account_for_delete(bigint) from public;
grant execute on function admin_account_for_delete(bigint) to ironlog_app;

-- 'done' or 'unknown' (no such account).
create function admin_delete_account(p_target bigint) returns text
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  caller bigint := nullif(current_setting('app.user_id', true), '')::bigint;
  login text;
  login_email text;
  target_admin boolean;
  target_suspended boolean;
begin
  if not exists (select 1 from users where id = caller and is_admin) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select auth_user_id, is_admin, suspended_at is not null into login, target_admin, target_suspended from users where id = p_target for update;
  if not found then return 'unknown'; end if;
  if p_target = caller or target_admin then
    raise exception 'an admin account cannot be deleted' using errcode = '22023';
  end if;
  if not target_suspended then
    raise exception 'suspend the account first' using errcode = '22023';
  end if;
  select email into login_email from auth."user" where id = login;
  insert into admin_actions (admin_user_id, target_user_id, action) values (caller, p_target, 'delete');
  -- Every data table, row_history and refused_writes reference users with ON DELETE CASCADE; the log row's target id is set null.
  delete from users where id = p_target;
  delete from auth.session where "userId" = login;
  delete from auth.account where "userId" = login;
  if login_email is not null then delete from auth.verification where identifier = login_email; end if;
  delete from auth."user" where id = login;
  return 'done';
end
$$;
revoke all on function admin_delete_account(bigint) from public;
grant execute on function admin_delete_account(bigint) to ironlog_app;

-- migrate:down

drop function admin_delete_account(bigint);
drop function admin_account_for_delete(bigint);
delete from admin_actions where action = 'delete';
alter table admin_actions drop constraint admin_actions_action_check;
alter table admin_actions add constraint admin_actions_action_check check (action in ('suspend', 'restore'));
