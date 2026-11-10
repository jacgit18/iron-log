-- migrate:up

-- Supplement barcode search (brief supplement-barcode-search, ADR 117): the UPC printed on a bottle, mapped to the catalog row to show for it. NIH DSLD cannot be searched
-- by UPC and its search results carry none, so `npm run catalog:upcs` reads each label's `upcSku` one label at a time and fills this table (run by the owner, like catalog:import).
-- Like catalog_items it is not synced data: no user_id, version, seq or tombstone. Expand only: a new table, nothing existing changes.
--
--   upc         the code as 14 digits, left padded with zeros (GS1 GTIN-14, the form `cleanGtin` gives), so a UPC-A, EAN-13 or typed code all find the same row
--   catalog_id  the supplement row to show: the one the catalog import kept for that label (it keeps one row per name, brand, form and label year)
--   imported_at when the crawler last wrote it
--
-- Row-level security as catalog_items: every signed-in account reads (app.user_id set, as inUserTransaction does); with nobody signed in nothing is visible; the API role cannot write.

create table supplement_upcs (
  upc         text primary key check (upc ~ '^[0-9]{14}$'),
  catalog_id  text not null references catalog_items (id),
  imported_at timestamptz not null default now()
);

create index supplement_upcs_catalog on supplement_upcs (catalog_id);

alter table supplement_upcs enable row level security;
grant select on supplement_upcs to ironlog_app;
create policy signed_in_reads on supplement_upcs for select to ironlog_app
  using (nullif(current_setting('app.user_id', true), '') is not null);

-- migrate:down

drop policy signed_in_reads on supplement_upcs;
revoke select on supplement_upcs from ironlog_app;
drop table supplement_upcs;
