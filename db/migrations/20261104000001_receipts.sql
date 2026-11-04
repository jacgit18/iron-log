-- migrate:up

-- Saved receipt photos (brief receipt-save-photo): the JPEG the owner chose to keep after Scan receipt, with the few fields shown in the list.
-- Admin only for now (app.ts). Not synced data: no seq, version, history trigger or tombstone. Like backup_snapshots the app role may delete its own
-- rows (the person deletes a receipt), and update them (the note). Expand only: a new table, no existing column changes. The caps (200 receipts,
-- 60 MB per account) are applied in server/receipts.ts, not here.
create table receipts (
  id           bigint generated always as identity primary key,
  user_id      bigint not null references users (id) on delete cascade,
  saved_at     timestamptz not null default now(),
  month        text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  receipt_date date check (receipt_date between '1970-01-01' and '2200-01-01'),
  store        text not null default '' check (length(store) <= 60),
  total_cents  int check (total_cents between 0 and 10000000),
  note         text not null default '' check (length(note) <= 200),
  size_bytes   int not null check (size_bytes between 1 and 1048576),
  data         bytea not null check (length(data) between 1 and 1048576)
);
create index receipts_user_saved on receipts (user_id, saved_at desc);

alter table receipts enable row level security;
grant select, insert, update, delete on receipts to ironlog_app;
create policy own_rows on receipts to ironlog_app
  using (user_id = nullif(current_setting('app.user_id', true), '')::bigint)
  with check (user_id = nullif(current_setting('app.user_id', true), '')::bigint);

-- Erasing everything removes the receipts too; deleting the account removes them by the cascade above. (Body is migration 20261025000001's, plus one line.)
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
  delete from receipts where user_id = uid;
  delete from refused_writes where user_id = uid;
  delete from row_history where user_id = uid;
  update users set data_epoch = data_epoch + 1, change_seq = change_seq + 1 where id = uid;
end
$$;

-- migrate:down

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

drop policy own_rows on receipts;
revoke select, insert, update, delete on receipts from ironlog_app;
drop table receipts;
