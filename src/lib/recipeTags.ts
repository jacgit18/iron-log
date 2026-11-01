import { MAX_TAG, MAX_TAGS, RECIPE_CATEGORIES, normTags } from '../shared/recipes.js';
import type { Recipe, RecipeCategory, RecipeChips } from '../types.ts';
import { byName } from './sort.js';

/* ---------- Recipe filters you can edit (brief recipe-filter-editing): pure, so every rule here is a node test ----------
   Two layers. The built-in categories are fixed (the importer, the server filter and other features use their ids); you only hide and
   reorder their chips. Tags are short text on your own recipes: no tag table, a tag exists while a recipe has it, compared without case. */

export const tagKey = (t: string) => t.toLowerCase();

/** One typed tag, cleaned the way a saved one is (spaces collapsed, cut to MAX_TAG), or '' when nothing is left. */
export const cleanTag = (t: string): string => normTags([t.slice(0, MAX_TAG * 4)])[0] ?? '';

export interface TagCount { tag: string; n: number }

/** The tags in use with how many recipes carry each, by name; the first spelling found is the one shown. */
export function tagCounts(list: readonly Recipe[]): TagCount[] {
  const found = new Map<string, TagCount>();
  for (const r of list) for (const t of r.tags ?? []) { const c = found.get(tagKey(t)); if (c) c.n++; else found.set(tagKey(t), { tag: t, n: 1 }); }
  return [...found.values()].sort((a, b) => byName(a.tag, b.tag) || (a.tag < b.tag ? -1 : 1));
}

/** Whether saving `tags` would take the list past MAX_TAGS different tags; the message, or null. `others` are the other recipes. */
export function tagLimitError(others: readonly Recipe[], tags: readonly string[] | undefined): string | null {
  const used = new Set(tagCounts(others).map(c => tagKey(c.tag)));
  (tags ?? []).forEach(t => used.add(tagKey(t)));
  return used.size > MAX_TAGS ? `You can use up to ${MAX_TAGS} different tags. Remove one from a recipe first.` : null;
}

/** Meal-type starters offered in the tag picker. They are ordinary tags: they count toward the cap only once a recipe has one. */
export const STARTER_TAGS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;

/** The starter tags to offer beside a recipe's form: not already in use on a recipe (those show with the tags in use) and not on this recipe. */
export function starterTags(list: readonly Recipe[], current: readonly string[]): string[] {
  const taken = new Set([...tagCounts(list).map(c => tagKey(c.tag)), ...current.map(tagKey)]);
  return STARTER_TAGS.filter(t => !taken.has(tagKey(t)));
}

/** Whether a recipe has every tag in `want` (any case). */
export const hasTags = (r: Pick<Recipe, 'tags'>, want: readonly string[]): boolean => {
  const have = new Set((r.tags ?? []).map(tagKey));
  return want.every(t => have.has(tagKey(t)));
};

/** The selected tags that are still in use (a rename or delete can leave a selection pointing at nothing), in their stored spelling. */
export function liveTags(list: readonly Recipe[], selected: readonly string[]): string[] {
  const by = new Map(tagCounts(list).map(c => [tagKey(c.tag), c.tag]));
  return selected.flatMap(t => (by.has(tagKey(t)) ? [by.get(tagKey(t))!] : []));
}

/** `list` with tag `from` renamed to `to` on every recipe that has it; a `to` that exists already merges the two. `changed` counts the recipes
 *  touched; `error` says why nothing was done. Never adds or removes a recipe. */
export function renameTag(list: readonly Recipe[], from: string, to: string): { list: Recipe[]; changed: number; error: string | null; name: string } {
  const next = cleanTag(to);
  if (!next) return { list: [...list], changed: 0, error: 'Type a name for the tag.', name: '' };
  let changed = 0;
  const existing = tagCounts(list).find(c => tagKey(c.tag) === tagKey(next))?.tag; // keep the spelling already in use when merging
  const name = existing && tagKey(existing) !== tagKey(from) ? existing : next;
  const out = list.map(r => {
    if (!(r.tags ?? []).some(t => tagKey(t) === tagKey(from))) return r;
    const tags = normTags((r.tags ?? []).map(t => (tagKey(t) === tagKey(from) ? name : t)));
    changed++;
    return { ...r, tags };
  });
  return { list: out, changed, error: null, name }; // `name`: the spelling the tag ends up with
}

/** `list` without tag `tag` on any recipe, and how many recipes had it. The recipes stay; one left with no tags drops the field. */
export function removeTag(list: readonly Recipe[], tag: string): { list: Recipe[]; changed: number } {
  let changed = 0;
  const out = list.map(r => {
    const tags = (r.tags ?? []).filter(t => tagKey(t) !== tagKey(tag));
    if (tags.length === (r.tags ?? []).length) return r;
    changed++;
    const { tags: _t, ...rest } = r;
    return tags.length ? { ...rest, tags } : rest;
  });
  return { list: out, changed };
}

/* ---------- The built-in chips: hide and reorder ---------- */

/** Every category in the order the chips show: the saved order first, then any left in the built-in order. */
export function chipOrder(chips: RecipeChips | undefined): RecipeCategory[] {
  const first = (chips?.order ?? []).filter((c, i, a) => RECIPE_CATEGORIES.includes(c) && a.indexOf(c) === i);
  return [...first, ...RECIPE_CATEGORIES.filter(c => !first.includes(c))];
}

/** The category chips to show on a tab: hidden ones left out, and Ready-made only on Mine (the Library has none). */
export const visibleChips = (chips: RecipeChips | undefined, mine: boolean): RecipeCategory[] =>
  chipOrder(chips).filter(c => !(chips?.hide ?? []).includes(c) && (mine || c !== 'ready'));

const isDefaultOrder = (o: readonly RecipeCategory[]) => o.every((c, i) => c === RECIPE_CATEGORIES[i]);

/** The setting for these hidden categories and this order, or undefined when both are the built-in defaults (so nothing is stored). */
export function chipSetting(hide: readonly RecipeCategory[], order: readonly RecipeCategory[]): RecipeChips | undefined {
  const h = RECIPE_CATEGORIES.filter(c => hide.includes(c));
  return h.length || !isDefaultOrder(order) ? { ...(h.length ? { hide: h } : {}), ...(!isDefaultOrder(order) ? { order: [...order] } : {}) } : undefined;
}

/** Hide a category's chip, or show it again. */
export function toggleChip(chips: RecipeChips | undefined, cat: RecipeCategory): RecipeChips | undefined {
  const hide = chips?.hide ?? [];
  return chipSetting(hide.includes(cat) ? hide.filter(c => c !== cat) : [...hide, cat], chipOrder(chips));
}

/** Move a category's chip one place earlier (-1) or later (1) in the full order; at the end it stays. */
export function moveChip(chips: RecipeChips | undefined, cat: RecipeCategory, by: -1 | 1): RecipeChips | undefined {
  const o = chipOrder(chips), i = o.indexOf(cat), j = i + by;
  if (i < 0 || j < 0 || j >= o.length) return chips;
  [o[i], o[j]] = [o[j]!, o[i]!];
  return chipSetting(chips?.hide ?? [], o);
}
