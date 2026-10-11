-- migrate:up

-- The catalog of exercises, stretches and supplements (ADR 025, 026, 028, 029). Users browse it and add items to their own
-- synced data; it is not part of the sync itself, so it has no user_id, version, seq or tombstones. It is seeded and refreshed by
-- `npm run catalog:import`, which runs as the owner.
--
--   id       the catalog id an account stores when it adds the item: `c:<source>:<dataset id>`, for example
--            c:fedb:Barbell_Squat or c:dsld:12345. It never changes, even when the name does.
--   kind     which list it belongs to. A free-exercise-db row in category `stretching` is a stretch, the rest are exercises.
--   source   the dataset (`fedb`, `dsld`), and license its terms as recorded at import.
--   brand    supplements only (DSLD); null otherwise.
--   data     the remaining fields the app shows (equipment, muscles, level, force, mechanic, instructions, form), already mapped
--            to the app's names by the importer. Read whole, never queried inside.
--   retired_at  set when a row disappears upstream. A row is never deleted (ADR 026 rule 5): an account that added it keeps its
--               snapshot, and search leaves it out.
--
-- Row-level security: the first table without a user_id. Every signed-in account reads every row (app.user_id set, as
-- inUserTransaction does); with nobody signed in nothing is visible. The API role cannot write: only the owner (the importer, the
-- admin by hand) does.

create table catalog_items (
  id          text primary key check (char_length(id) <= 200),
  kind        text not null check (kind in ('exercise', 'stretch', 'supplement')),
  source      text not null check (source ~ '^[a-z]{2,20}$'),
  license     text not null check (char_length(license) between 1 and 200),
  name        text not null check (char_length(name) between 1 and 300),
  brand       text check (char_length(brand) between 1 and 300),
  data        jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  imported_at timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  retired_at  timestamptz,
  check (starts_with(id, 'c:' || source || ':') and char_length(id) > char_length(source) + 3)
);

-- Browsing one list in name order, retired rows left out.
create index catalog_items_kind_name on catalog_items (kind, lower(name)) where retired_at is null;

alter table catalog_items enable row level security;
grant select on catalog_items to ironlog_app;
create policy signed_in_reads on catalog_items for select to ironlog_app
  using (nullif(current_setting('app.user_id', true), '') is not null);

-- migrate:down

drop policy signed_in_reads on catalog_items;
revoke select on catalog_items from ironlog_app;
drop table catalog_items;
