-- migrate:up

-- Migration 003: the week documents (build spec 6a, Phase C). Design: docs/data-model/iron-log.md.
-- One row per user and week; the document is read and written whole, so it stays jsonb. A deleted week keeps its row
-- and logging it again revives it, as with body_entries.

create table weeks (
  id                bigint generated always as identity primary key,
  user_id           bigint not null references users (id) on delete cascade,
  version           integer not null default 1,
  seq               bigint not null,
  schema_version    smallint not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  client_updated_at timestamptz,
  deleted_at        timestamptz,

  week_start  date not null check (week_start between date '1970-01-01' and date '2200-12-31'),
  data        jsonb not null check (jsonb_typeof(data) = 'object')
);

create unique index weeks_user_week_start on weeks (user_id, week_start);
create index weeks_user_seq on weeks (user_id, seq);

create trigger weeks_row_history
  before update on weeks
  for each row execute function record_row_history();

create table stretch_weeks (
  id                bigint generated always as identity primary key,
  user_id           bigint not null references users (id) on delete cascade,
  version           integer not null default 1,
  seq               bigint not null,
  schema_version    smallint not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  client_updated_at timestamptz,
  deleted_at        timestamptz,

  week_start  date not null check (week_start between date '1970-01-01' and date '2200-12-31'),
  data        jsonb not null check (jsonb_typeof(data) = 'object')
);

create unique index stretch_weeks_user_week_start on stretch_weeks (user_id, week_start);
create index stretch_weeks_user_seq on stretch_weeks (user_id, seq);

create trigger stretch_weeks_row_history
  before update on stretch_weeks
  for each row execute function record_row_history();

-- migrate:down

drop trigger stretch_weeks_row_history on stretch_weeks;
drop table stretch_weeks;
drop trigger weeks_row_history on weeks;
drop table weeks;
