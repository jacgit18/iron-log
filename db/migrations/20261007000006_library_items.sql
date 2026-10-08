-- migrate:up

-- Migration 006: saved versions of a program (build spec 6a, Phase C). One row per user and saved version, keyed by the
-- client's id. The whole item is one jsonb document: it is read and written whole and never queried inside, so the
-- name, saved-at and flags that the data model listed as columns live in `data` with the program (a change from the
-- design doc). A deleted version keeps its row and saving the same id again revives it.

create table library_items (
  id                bigint generated always as identity primary key,
  user_id           bigint not null references users (id) on delete cascade,
  client_id         text not null check (char_length(client_id) between 1 and 100),
  version           integer not null default 1,
  seq               bigint not null,
  schema_version    smallint not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  client_updated_at timestamptz,
  deleted_at        timestamptz,

  data  jsonb not null check (jsonb_typeof(data) = 'object')
);

create unique index library_items_user_client_id on library_items (user_id, client_id);
create index library_items_user_seq on library_items (user_id, seq);

create trigger library_items_row_history
  before update on library_items
  for each row execute function record_row_history();

-- migrate:down

drop trigger library_items_row_history on library_items;
drop table library_items;
