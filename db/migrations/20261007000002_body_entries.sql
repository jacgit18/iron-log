-- migrate:up

-- Migration 002: body weight, one row per user and week (build spec 6a, Phase C). Design: docs/data-model/iron-log.md.
-- The week is the key, so there is no client_id. A deleted week keeps its row: logging it again revives it.

create table body_entries (
  id                bigint generated always as identity primary key,
  user_id           bigint not null references users (id) on delete cascade,
  version           integer not null default 1,
  seq               bigint not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  client_updated_at timestamptz,
  deleted_at        timestamptz,

  wk         date not null check (wk between date '1970-01-01' and date '2200-12-31'),
  d          date not null check (d between date '1970-01-01' and date '2200-12-31'),
  weight_lb  numeric(8, 4) not null check (weight_lb > 0 and weight_lb < 1500)
);

create unique index body_entries_user_wk on body_entries (user_id, wk);
create index body_entries_user_seq on body_entries (user_id, seq);

create trigger body_entries_row_history
  before update on body_entries
  for each row execute function record_row_history();

-- migrate:down

drop trigger body_entries_row_history on body_entries;
drop table body_entries;
