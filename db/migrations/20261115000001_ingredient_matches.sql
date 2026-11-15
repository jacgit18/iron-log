-- migrate:up

-- Ingredient match cache (brief recipe-auto-nutrition, PR 1): one resolved ingredient line, so a second Fill on the same text makes no model call and no USDA call.
--   key         SHA-256 hex of the resolver version and the normalised line (server/ingredients.ts); the text itself is never stored
--   result      the match (status, USDA food id and name, grams, where the grams came from, confidence) and the food's per-100 g numbers
--   created_at  when it was resolved
-- Like catalog_items it is not synced data and not personal data: no user_id, version, seq or tombstone, so it is not part of erase or export.
-- Expand only: a new table, nothing existing changes. Row-level security: every signed-in account reads and adds (app.user_id set, as inUserTransaction does);
-- nobody signed in sees nothing; the API role cannot update or delete (the owner empties it with `truncate`).

create table ingredient_matches (
  key        text primary key check (key ~ '^[0-9a-f]{64}$'),
  result     jsonb not null,
  created_at timestamptz not null default now()
);

alter table ingredient_matches enable row level security;
grant select, insert on ingredient_matches to ironlog_app;
create policy signed_in_reads on ingredient_matches for select to ironlog_app
  using (nullif(current_setting('app.user_id', true), '') is not null);
create policy signed_in_adds on ingredient_matches for insert to ironlog_app
  with check (nullif(current_setting('app.user_id', true), '') is not null);

-- migrate:down

drop policy signed_in_adds on ingredient_matches;
drop policy signed_in_reads on ingredient_matches;
revoke select, insert on ingredient_matches from ironlog_app;
drop table ingredient_matches;
