-- migrate:up

-- Migration 022: sharing groups for the grocery list. A group is the set of people a user splits groceries with ("Home", "Costco run") and
-- the stores that default to it. It is one list_items row (list 'grocery_group', data {id, n, people: [{id, n, covered?}], stores: [name]}),
-- like a store, so this only lets the list name through; no new table, grant or policy. The new fields on an item (share) and on a month's
-- lines (share, packShares, payer) live in the existing jsonb columns and need no change.
alter table list_items drop constraint list_items_list_check;
alter table list_items add constraint list_items_list_check
  check (list in ('stretch', 'stretch_experiment', 'experiment', 'supplement_item', 'grocery_item', 'grocery_store', 'grocery_group'));

-- migrate:down

delete from row_history where table_name = 'list_items' and data ->> 'list' = 'grocery_group';
delete from list_items where list = 'grocery_group';
alter table list_items drop constraint list_items_list_check;
alter table list_items add constraint list_items_list_check
  check (list in ('stretch', 'stretch_experiment', 'experiment', 'supplement_item', 'grocery_item', 'grocery_store'));
