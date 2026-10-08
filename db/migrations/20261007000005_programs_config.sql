-- migrate:up

-- Migration 005: the two single-document tables (build spec 6a, Phase C). Design: docs/data-model/iron-log.md.
-- programs: one row per user and program key ('A' or 'B'); saved versions live in library_items, not here.
-- config: one row per user. Both are read and written whole, so the document stays jsonb. A deleted row is kept and
-- saving it again revives it, as with body_entries and weeks.

create table programs (
  id                bigint generated always as identity primary key,
  user_id           bigint not null references users (id) on delete cascade,
  version           integer not null default 1,
  seq               bigint not null,
  schema_version    smallint not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  client_updated_at timestamptz,
  deleted_at        timestamptz,

  key   text not null check (key in ('A', 'B')),
  data  jsonb not null check (jsonb_typeof(data) = 'object')
);

create unique index programs_user_key on programs (user_id, key);
create index programs_user_seq on programs (user_id, seq);

create trigger programs_row_history
  before update on programs
  for each row execute function record_row_history();

create table config (
  id                bigint generated always as identity primary key,
  user_id           bigint not null references users (id) on delete cascade,
  version           integer not null default 1,
  seq               bigint not null,
  schema_version    smallint not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  client_updated_at timestamptz,
  deleted_at        timestamptz,

  data  jsonb not null check (jsonb_typeof(data) = 'object')
);

create unique index config_user on config (user_id);
create index config_user_seq on config (user_id, seq);

create trigger config_row_history
  before update on config
  for each row execute function record_row_history();

-- migrate:down

drop trigger config_row_history on config;
drop table config;
drop trigger programs_row_history on programs;
drop table programs;
