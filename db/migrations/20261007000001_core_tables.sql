-- migrate:up

-- Migration 001: the smallest schema `log-session` needs (build spec 6a, A2).
-- Design: docs/data-model/iron-log.md. Row-level security is added with real sign-in (phase B2).
-- The server sets version, seq and updated_at inside each command; the only trigger is row_history's.

create table users (
  id            bigint generated always as identity primary key,
  auth_user_id  text not null unique,
  is_admin      boolean not null default false,
  change_seq    bigint not null default 0,
  created_at    timestamptz not null default now()
);

create table log_entries (
  id                bigint generated always as identity primary key,
  user_id           bigint not null references users (id) on delete cascade,
  client_id         text not null check (char_length(client_id) between 1 and 100),
  version           integer not null default 1,
  seq               bigint not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  client_updated_at timestamptz,
  deleted_at        timestamptz,

  exercise_id  text not null check (char_length(exercise_id) between 1 and 100),
  d            date not null check (d between date '1970-01-01' and date '2200-12-31'),
  phase        text check (phase in ('strength', 'iso', 'hyp', 'exp', 'mob')),
  weight_lb    numeric(9, 4) check (weight_lb >= 0 and weight_lb < 5000),
  sets_count   smallint check (sets_count between 0 and 200),
  reps         numeric(7, 2) check (reps between 0 and 1000),
  hold_sec     numeric(8, 2) check (hold_sec between 0 and 86400),
  sets         jsonb,
  note         text check (char_length(note) <= 500),
  slot         text check (char_length(slot) between 1 and 100),
  wk           date check (wk between date '1970-01-01' and date '2200-12-31'),
  auto         boolean not null default false,

  constraint log_entries_check_off_has_slot_and_week
    check (not auto or (slot is not null and wk is not null))
);

-- Idempotent create and edit by id.
create unique index log_entries_user_client_id on log_entries (user_id, client_id);
-- Rule 1: one check-off per card and week.
create unique index log_entries_one_check_off
  on log_entries (user_id, exercise_id, slot, wk) where auto and deleted_at is null;
-- Rules 2, 3 and 7 look entries up by exercise and week inside the command transaction.
create index log_entries_user_exercise_week
  on log_entries (user_id, exercise_id, wk) where deleted_at is null;
-- The change-feed pull.
create index log_entries_user_seq on log_entries (user_id, seq);

create table row_history (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references users (id) on delete cascade,
  table_name  text not null check (table_name in (
                'config', 'programs', 'library_items', 'log_entries', 'body_entries',
                'weeks', 'stretch_weeks', 'list_items', 'supplement_days')),
  row_id      bigint not null,
  version     integer not null,
  data        jsonb not null,
  replaced_at timestamptz not null default now()
);

create index row_history_row on row_history (user_id, table_name, row_id, version);
create index row_history_replaced_at on row_history (replaced_at);

-- Copies the old row before any update, whoever makes it (the app or hand-written SQL).
create function record_row_history() returns trigger language plpgsql as $$
begin
  insert into row_history (user_id, table_name, row_id, version, data)
  values (old.user_id, tg_table_name, old.id, old.version, to_jsonb(old));
  return new;
end;
$$;

create trigger log_entries_row_history
  before update on log_entries
  for each row execute function record_row_history();

create table refused_writes (
  id             bigint generated always as identity primary key,
  user_id        bigint not null references users (id) on delete cascade,
  command        text not null,
  client_id      text,
  reason         text not null,
  payload        jsonb,
  client_version text,
  received_at    timestamptz not null default now()
);

create index refused_writes_received_at on refused_writes (received_at);
create index refused_writes_user_received_at on refused_writes (user_id, received_at);

-- migrate:down

drop table refused_writes;
drop trigger log_entries_row_history on log_entries;
drop function record_row_history();
drop table row_history;
drop table log_entries;
drop table users;
