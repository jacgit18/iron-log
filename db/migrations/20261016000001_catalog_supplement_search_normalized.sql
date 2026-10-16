-- migrate:up

-- The supplement search (ADR 029) now compares name and brand with apostrophes dropped and other punctuation as spaces, so "natures way"
-- finds Nature's Way and "b-12" finds B 12. The trigram index is rebuilt on that same expression (keep it in step with
-- `normalized` in server/catalog.ts). Only live supplement rows are indexed.

create index catalog_items_supplement_search_norm on catalog_items
  using gin ((lower(regexp_replace(regexp_replace(name || ' ' || coalesce(brand, ''), '[''’]', '', 'g'), '[^[:alnum:]]+', ' ', 'g'))) gin_trgm_ops)
  where kind = 'supplement' and retired_at is null;

drop index catalog_items_supplement_search;

-- migrate:down

create index catalog_items_supplement_search on catalog_items
  using gin ((lower(name || ' ' || coalesce(brand, ''))) gin_trgm_ops)
  where kind = 'supplement' and retired_at is null;

drop index catalog_items_supplement_search_norm;
