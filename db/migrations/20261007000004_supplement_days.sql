-- migrate:up

-- Migration 004: one row per user and day for the water log, the day's boost and the supplements ticked off.
-- The supplement list itself (list_items) and the water goal and mode (config) come later. A deleted day keeps its row
-- and logging it again revives it, as with body_entries.

create table supplement_days (
  id                bigint generated always as identity primary key,
  user_id           bigint not null references users (id) on delete cascade,
  version           integer not null default 1,
  seq               bigint not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  client_updated_at timestamptz,
  deleted_at        timestamptz,

  day    date not null check (day between date '1970-01-01' and date '2200-12-31'),
  water  jsonb not null default '[]' check (jsonb_typeof(water) = 'array'),
  boost  jsonb check (boost is null or jsonb_typeof(boost) = 'object'),
  taken  jsonb not null default '{}' check (jsonb_typeof(taken) = 'object')
);

create unique index supplement_days_user_day on supplement_days (user_id, day);
create index supplement_days_user_seq on supplement_days (user_id, seq);

create trigger supplement_days_row_history
  before update on supplement_days
  for each row execute function record_row_history();

-- migrate:down

drop trigger supplement_days_row_history on supplement_days;
drop table supplement_days;
