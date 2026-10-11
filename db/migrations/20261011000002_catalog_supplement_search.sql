-- migrate:up

-- Searching the supplement catalog (ADR 029): about 120,000 DSLD products, too many to send whole, so GET /api/catalog/search looks up
-- words in the name and brand on the server. A trigram index makes `lower(name || ' ' || brand) like '%word%'` fast. pg_trgm is a
-- trusted extension, so the database owner can create it (Neon included). Only live supplement rows are indexed.

create extension if not exists pg_trgm;

create index catalog_items_supplement_search on catalog_items
  using gin ((lower(name || ' ' || coalesce(brand, ''))) gin_trgm_ops)
  where kind = 'supplement' and retired_at is null;

-- migrate:down

drop index catalog_items_supplement_search;
drop extension if exists pg_trgm;
