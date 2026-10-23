-- migrate:up

-- Server backup history (ADR 066, brief server-backup-history): one gzipped Export-all-data file per account per day, uploaded by the app.
-- Free accounts see and keep the newest 7 days, paid and admin accounts the newest 30 (enforced in server/backups.ts, not here).
-- Not synced data: no seq, version, history trigger or tombstone. Like push_subscription the app role may delete its own rows (pruning),
-- which the data tables forbid. Expand only: a new table, no existing column changes.
create table backup_snapshots (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references users (id) on delete cascade,
  day         date not null check (day between '1970-01-01' and '2200-01-01'),
  saved_at    timestamptz not null default now(),
  entries     int not null check (entries >= 0),
  score       int not null check (score >= 0),
  size_bytes  int not null check (size_bytes between 1 and 1048576),
  data        bytea not null check (length(data) between 1 and 1048576),
  unique (user_id, day)
);

alter table backup_snapshots enable row level security;
grant select, insert, update, delete on backup_snapshots to ironlog_app;
create policy own_rows on backup_snapshots to ironlog_app
  using (user_id = nullif(current_setting('app.user_id', true), '')::bigint)
  with check (user_id = nullif(current_setting('app.user_id', true), '')::bigint);

-- Erasing everything removes the snapshots too; deleting the account removes them by the cascade above. (Body is migration 017's, plus one line.)
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
  delete from push_subscription where user_id = uid;
  delete from refused_writes where user_id = uid;
  delete from row_history where user_id = uid;
  update users set data_epoch = data_epoch + 1, change_seq = change_seq + 1 where id = uid;
end
$$;

drop policy own_rows on backup_snapshots;
revoke select, insert, update, delete on backup_snapshots from ironlog_app;
drop table backup_snapshots;
