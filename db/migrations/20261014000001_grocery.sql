-- migrate:up

-- Migration 015: the grocery list moves from the device to the account (ADR 039, replacing ADR 019's device-only decision).
--   * The catalogue is list_items rows: one per item (list 'grocery_item', data {id, n, store, qty, cents, every, out}) and one per
--     store (list 'grocery_store', data {id, n}, the name is the id), in `position` order, like the supplements list.
--   * Each month is one grocery_months row (`month` 'YYYY-MM', data {lines, pulled}), read and written whole like a week, and merged
--     three-way on the phone when two devices change it at once.
-- The table copies weeks: version, seq, a deleted_at tombstone, the row-history trigger and the own_rows policy.

alter table list_items drop constraint list_items_list_check;
alter table list_items add constraint list_items_list_check
  check (list in ('stretch', 'stretch_experiment', 'experiment', 'supplement_item', 'grocery_item', 'grocery_store'));

create table grocery_months (
  id                bigint generated always as identity primary key,
  user_id           bigint not null references users (id) on delete cascade,
  version           integer not null default 1,
  seq               bigint not null,
  schema_version    smallint not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  client_updated_at timestamptz,
  deleted_at        timestamptz,

  month  text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  data   jsonb not null check (jsonb_typeof(data) = 'object')
);

create unique index grocery_months_user_month on grocery_months (user_id, month);
create index grocery_months_user_seq on grocery_months (user_id, seq);

alter table row_history drop constraint row_history_table_name_check;
alter table row_history add constraint row_history_table_name_check check (table_name in (
  'config', 'programs', 'library_items', 'log_entries', 'body_entries',
  'weeks', 'stretch_weeks', 'list_items', 'supplement_days', 'grocery_months'));

create trigger grocery_months_row_history
  before update on grocery_months
  for each row execute function record_row_history();

-- Row-level security, as migration 009 does for every data table: the owner's rows only, and no delete for the app role.
alter table grocery_months enable row level security;
grant select, insert, update on grocery_months to ironlog_app;
create policy own_rows on grocery_months to ironlog_app
  using (user_id = nullif(current_setting('app.user_id', true), '')::bigint)
  with check (user_id = nullif(current_setting('app.user_id', true), '')::bigint);

-- Erasing your data removes the months too (the list items go with list_items already).
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
  delete from refused_writes where user_id = uid;
  delete from row_history where user_id = uid;
  update users set data_epoch = data_epoch + 1, change_seq = change_seq + 1 where id = uid;
end
$$;

drop policy own_rows on grocery_months;
revoke select, insert, update on grocery_months from ironlog_app;
drop trigger grocery_months_row_history on grocery_months;
drop table grocery_months;

-- The history of the months goes with them, and the grocery list items with their lists, so the old checks hold again.
delete from row_history where table_name = 'grocery_months';
alter table row_history drop constraint row_history_table_name_check;
alter table row_history add constraint row_history_table_name_check check (table_name in (
  'config', 'programs', 'library_items', 'log_entries', 'body_entries',
  'weeks', 'stretch_weeks', 'list_items', 'supplement_days'));

delete from row_history where table_name = 'list_items' and data ->> 'list' in ('grocery_item', 'grocery_store');
delete from list_items where list in ('grocery_item', 'grocery_store');
alter table list_items drop constraint list_items_list_check;
alter table list_items add constraint list_items_list_check
  check (list in ('stretch', 'stretch_experiment', 'experiment', 'supplement_item'));
