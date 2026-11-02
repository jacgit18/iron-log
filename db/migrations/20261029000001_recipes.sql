-- migrate:up

-- Recipes (ADR 084). Two widenings of existing checks, no new table, grant or policy:
--   * list_items: a recipe you wrote is one row (list 'recipe', data {id, n, cat, ing, steps, ...}), like a store or an experiment.
--   * catalog_items: the library recipes are rows of kind 'recipe' (seeded by `npm run catalog:import -- --source wbc`).
-- Expand only: nothing existing changes, so the code can ship after this has run.
alter table list_items drop constraint list_items_list_check;
alter table list_items add constraint list_items_list_check
  check (list in ('stretch', 'stretch_experiment', 'experiment', 'supplement_item', 'grocery_item', 'grocery_store', 'grocery_group', 'recipe'));

alter table catalog_items drop constraint catalog_items_kind_check;
alter table catalog_items add constraint catalog_items_kind_check
  check (kind in ('exercise', 'stretch', 'supplement', 'recipe'));

-- migrate:down

-- Rollback removes the recipes with the check that allows them (the account's own recipes are lost: export first).
delete from row_history where table_name = 'list_items' and data ->> 'list' = 'recipe';
delete from list_items where list = 'recipe';
alter table list_items drop constraint list_items_list_check;
alter table list_items add constraint list_items_list_check
  check (list in ('stretch', 'stretch_experiment', 'experiment', 'supplement_item', 'grocery_item', 'grocery_store', 'grocery_group'));

delete from catalog_items where kind = 'recipe';
alter table catalog_items drop constraint catalog_items_kind_check;
alter table catalog_items add constraint catalog_items_kind_check
  check (kind in ('exercise', 'stretch', 'supplement'));
