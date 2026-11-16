-- migrate:up

-- Library recipe nutrition (brief library-recipe-nutrition, ADR 134): estimated per-serving numbers for a Library recipe, worked out from its ingredient lines by an
-- owner-run batch (`npm run catalog:nutrition`) and applied by hand, like catalog:import. Expand only: one nullable column, nothing existing changes; null means "no numbers".
-- It is a column of its own, not a key inside `data`, because catalog:import compares and overwrites `data` on every run: numbers inside it would be wiped or would mark
-- every row changed. Shape (checked in src/shared/libraryNutrition.ts, not here): kcal, p, c, f, micro, servings, sEst, of, n, hash, v.
-- Written only by the apply step as the owner role; the API role already reads catalog_items (row-level security unchanged).

alter table catalog_items add column nutrition jsonb;

-- migrate:down

alter table catalog_items drop column nutrition;
