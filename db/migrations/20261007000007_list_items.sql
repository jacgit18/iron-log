-- migrate:up

-- Migration 007: the small id-keyed lists (build spec 6a, Phase C): stretches, stretch experiments, experiments and
-- supplements. One row per user, list and item, keyed by the item's own id. The item is one jsonb document. The order
-- the lists are shown in is `position` (a change from the design doc, which had no order column): the phone sends each
-- item's position with its save, so moving an item is a save of the items whose position changed. A deleted item keeps
-- its row and saving the same id again revives it.

create table list_items (
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

  list      text not null check (list in ('stretch', 'stretch_experiment', 'experiment', 'supplement_item')),
  position  integer not null check (position between 0 and 9999),
  data      jsonb not null check (jsonb_typeof(data) = 'object')
);

create unique index list_items_user_list_client_id on list_items (user_id, list, client_id);
create index list_items_user_seq on list_items (user_id, seq);

create trigger list_items_row_history
  before update on list_items
  for each row execute function record_row_history();

-- migrate:down

drop trigger list_items_row_history on list_items;
drop table list_items;
