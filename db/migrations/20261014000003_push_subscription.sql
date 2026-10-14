-- migrate:up

-- Migration 017: Web Push subscriptions (ADR 044). One row per browser that turned push on for an account.
-- Not synced data: no seq, version or history. It is device plumbing, so the app role may delete its own rows
-- (turning push off, or a push service answering 404 or 410), which the data tables forbid. An endpoint is a
-- credential (anyone holding it with the keys can push to that browser): it is never returned by the API or synced.
create table push_subscription (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references users (id) on delete cascade,
  endpoint    text not null check (endpoint ~ '^https://' and length(endpoint) <= 2048),
  p256dh      text not null check (length(p256dh) between 1 and 256),
  auth        text not null check (length(auth) between 1 and 256),
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);

create unique index push_subscription_user_endpoint on push_subscription (user_id, endpoint);

alter table push_subscription enable row level security;
grant select, insert, update, delete on push_subscription to ironlog_app;
create policy own_rows on push_subscription to ironlog_app
  using (user_id = nullif(current_setting('app.user_id', true), '')::bigint)
  with check (user_id = nullif(current_setting('app.user_id', true), '')::bigint);

-- Erasing your data also turns push off on every device. Deleting the account removes the rows by the cascade above.
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
  delete from refused_writes where user_id = uid;
  delete from row_history where user_id = uid;
  update users set data_epoch = data_epoch + 1, change_seq = change_seq + 1 where id = uid;
end
$$;

-- migrate:down

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
  delete from refused_writes where user_id = uid;
  delete from row_history where user_id = uid;
  update users set data_epoch = data_epoch + 1, change_seq = change_seq + 1 where id = uid;
end
$$;

drop policy own_rows on push_subscription;
revoke select, insert, update, delete on push_subscription from ironlog_app;
drop table push_subscription;
