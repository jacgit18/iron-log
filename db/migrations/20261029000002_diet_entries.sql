-- migrate:up

-- Diet log (ADR 086). One widening of an existing check, no new table, grant or policy:
--   * list_items: one thing you ate is one row (list 'diet_entry', data {id, d, n, kcal, p, from?}), like a recipe or a grocery item.
-- Expand only: nothing existing changes, so the code can ship after this has run.
alter table list_items drop constraint list_items_list_check;
alter table list_items add constraint list_items_list_check
  check (list in ('stretch', 'stretch_experiment', 'experiment', 'supplement_item', 'grocery_item', 'grocery_store', 'grocery_group', 'recipe', 'diet_entry'));

-- migrate:down

-- Rollback removes the food log with the check that allows it (the account's own entries are lost: export first).
delete from row_history where table_name = 'list_items' and data ->> 'list' = 'diet_entry';
delete from list_items where list = 'diet_entry';
alter table list_items drop constraint list_items_list_check;
alter table list_items add constraint list_items_list_check
  check (list in ('stretch', 'stretch_experiment', 'experiment', 'supplement_item', 'grocery_item', 'grocery_store', 'grocery_group', 'recipe'));
