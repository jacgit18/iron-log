-- migrate:up

-- Migration 010: hard deletion, the one thing the API role cannot do itself (migration 009 gives it no DELETE, so a bug cannot erase
-- anyone's data). Two functions run as the owner, like ensure_user(), and each acts only on the caller's own account: they read
-- whose data it is from app.user_id, which inUserTransaction sets per transaction, never from an argument.
--
--   erase_my_data()    removes every data row of the caller, including the history copies (row_history holds the old version of
--                      every edited row) and the refusal records. The account and its sign-in stay.
--   delete_my_account() does that and removes the account: the users row, and Better Auth's user, sessions, accounts (Google
--                      tokens) and verification records.
--
-- A hard delete leaves no tombstone for another phone to pull, so users.data_epoch says "this account's data was reset": it goes up
-- on an erase, the pull feed carries it, and a phone that sees a different one throws away its copy and pulls again from the start.

alter table users add column data_epoch bigint not null default 1;

create function erase_my_data() returns void
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
  delete from refused_writes where user_id = uid;
  delete from row_history where user_id = uid;
  update users set data_epoch = data_epoch + 1, change_seq = change_seq + 1 where id = uid;
end
$$;
revoke all on function erase_my_data() from public;
grant execute on function erase_my_data() to ironlog_app;

create function delete_my_account() returns void
  language plpgsql security definer set search_path = public as $$
declare
  uid bigint := nullif(current_setting('app.user_id', true), '')::bigint;
  login text;
  login_email text;
begin
  if uid is null then raise exception 'delete_my_account: no signed-in user'; end if;
  select auth_user_id into login from users where id = uid;
  if login is null then raise exception 'delete_my_account: no such user'; end if;
  select email into login_email from auth."user" where id = login;
  -- Every data table, row_history and refused_writes reference users with ON DELETE CASCADE.
  delete from users where id = uid;
  -- Better Auth's records: sessions and accounts cascade from the user; verification records are found by the email they were made for.
  delete from auth.session where "userId" = login;
  delete from auth.account where "userId" = login;
  if login_email is not null then delete from auth.verification where identifier = login_email; end if;
  delete from auth."user" where id = login;
end
$$;
revoke all on function delete_my_account() from public;
grant execute on function delete_my_account() to ironlog_app;

-- migrate:down

revoke execute on function delete_my_account() from ironlog_app;
drop function delete_my_account();
revoke execute on function erase_my_data() from ironlog_app;
drop function erase_my_data();
alter table users drop column data_epoch;
