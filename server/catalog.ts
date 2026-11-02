import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { CatalogData, CatalogKind, RecipeCategory } from '../src/types.ts';
import { RECIPE_CATEGORIES } from '../src/shared/recipes.ts';
import { inUserTransaction } from './auth.ts';
import type { DB } from './db/types.ts';

// GET /api/catalog?kind=exercise|stretch (ADR 025), for every signed-in account: the whole list of one kind, live rows only, in name order, for browsing and adding.
// Read through the API role, so row-level security applies (signed-in accounts read). Not part of the sync: no seq, no tombstones; an
// account that adds an item stores its own snapshot (ADR 026). Instructions are left out to keep the list small. Supplements are
// searched and paged instead (ADR 029), so they are not served here.

export const LISTED_KINDS: readonly CatalogKind[] = ['exercise', 'stretch'];

/** One catalog row as the browse list shows it. */
export interface CatalogListItem { id: string; name: string; data: Omit<CatalogData, 'instructions'> }

export async function listCatalog(db: Kysely<DB>, userId: string, kind: CatalogKind): Promise<CatalogListItem[]> {
  const rows = await inUserTransaction(db, userId, trx => trx.selectFrom('catalog_items')
    .select(['id', 'name', 'data'])
    .where('kind', '=', kind).where('retired_at', 'is', null)
    .orderBy(eb => eb.fn('lower', ['name'])).orderBy('id')
    .execute());
  return rows.map(r => {
    const { instructions: _drop, ...data } = (r.data ?? {}) as CatalogData;
    return { id: r.id, name: r.name, data };
  });
}

// GET /api/catalog/search?kind=supplement&q=<words>&offset=<n> (ADR 029): about 120,000 supplements are too many to send whole, so the
// server looks them up. Name and brand are searched as one text with apostrophes dropped and other punctuation turned into spaces, on
// both sides ("natures way" finds Nature's Way, "b-12" finds B 12), and every word typed must appear in it, in any order. Best first:
// names starting with the whole phrase, then results where every word starts a word (so "vit" ranks Vitamin above Motivation), then names
// starting with the first word, then shorter names. One page of SEARCH_PAGE at a time, `more` when there is another. The trigram index
// (migration 20261016000001) covers the same expression, so this stays fast.

// Recipes (ADR 084) are searched the same way, on the name and the ingredient lines; with no words they page through the whole kind in name
// order, and `cat` narrows either to one category.
export const SEARCHED_KINDS: readonly CatalogKind[] = ['supplement', 'recipe'];
export const SEARCH_PAGE = 30;
const MAX_OFFSET = 600;
const MAX_RECIPE_OFFSET = 5000; // the whole library (about 3,700 recipes) can be paged through

export const SEARCH_SORTS = ['relevance', 'name'] as const; // recipes only: `name` skips the best-match order (lower-cased name, then id)
export type SearchSort = typeof SEARCH_SORTS[number];
export interface CatalogSearch { kind: CatalogKind; words: string[]; offset: number; cat?: RecipeCategory; sort?: SearchSort }
export interface CatalogSearchResult { items: (CatalogListItem & { brand?: string })[]; more: boolean }

/** The words of a text as the search compares them: lower case, apostrophes dropped, other punctuation as spaces. */
export const searchWords = (text: string) => text.toLowerCase().replace(/['’]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** The search a query asks for, or null when it is not one we answer. */
export function parseSearch(query: Record<string, unknown>): CatalogSearch | null {
  const kind = SEARCHED_KINDS.find(k => k === query.kind);
  if (!kind) return null;
  const recipes = kind === 'recipe';
  const q = recipes && query.q === undefined ? '' : query.q;
  if (typeof q !== 'string') return null;
  const words = searchWords(q);
  if (q.length > 100 || words.length > 6 || (!recipes && q.trim().length < 2)) return null;
  const raw = query.offset ?? '0';
  if (typeof raw !== 'string' || !/^\d{1,4}$/.test(raw) || Number(raw) > (recipes ? MAX_RECIPE_OFFSET : MAX_OFFSET)) return null;
  const offset = Number(raw);
  let sort: SearchSort | undefined;
  if (query.sort !== undefined) {
    sort = SEARCH_SORTS.find(x => x === query.sort);
    if (!recipes || !sort) return null;
  }
  const out: CatalogSearch = { kind, words, offset, ...(sort ? { sort } : {}) };
  if (query.cat === undefined) return out;
  const cat = RECIPE_CATEGORIES.find(c => c === query.cat);
  return recipes && cat ? { ...out, cat } : null;
}

// A typed word, matched literally: % and _ are LIKE wildcards, and a backslash escapes them (words are letters and digits only, so
// this is a guard).
const escapeLike = (w: string) => w.replace(/[\\%_]/g, c => `\\${c}`);

// The same text the index is built on (keep in step with migration 20261016000001).
const normalized = (expr: RawBuilder<string>) =>
  sql<string>`lower(regexp_replace(regexp_replace(${expr}, ${sql.lit("['’]")}, '', 'g'), ${sql.lit('[^[:alnum:]]+')}, ' ', 'g'))`;

export async function searchCatalog(db: Kysely<DB>, userId: string, { kind, words, offset, cat, sort }: CatalogSearch): Promise<CatalogSearchResult> {
  if (!words.length && kind !== 'recipe') return { items: [], more: false };
  const text = normalized(kind === 'recipe' ? sql`name || ' ' || coalesce(data #>> '{recipe,ing}', '')` : sql`name || ' ' || coalesce(brand, '')`);
  const nameText = normalized(sql`name`);
  const phrase = escapeLike(words.join(' '));
  const first = escapeLike(words[0] ?? '');
  const wordStarts = sql.join(words.map(w => sql`(' ' || ${text}) like ${`% ${escapeLike(w)}%`}`), sql` and `);
  const rows = await inUserTransaction(db, userId, trx => {
    let q = trx.selectFrom('catalog_items').select(['id', 'name', 'brand', 'data'])
      .where('kind', '=', kind).where('retired_at', 'is', null);
    if (cat) q = q.where(sql`data #>> '{recipe,cat}'`, '=', cat);
    for (const w of words) q = q.where(text, 'like', `%${escapeLike(w)}%`);
    // No words (recipes browsed by category), or sort=name: plain name order (lower-cased name, then id), so paging is stable.
    const byName = !words.length || sort === 'name';
    if (!byName) q = q.orderBy(sql`${nameText} like ${`${phrase}%`}`, 'desc')
      .orderBy(sql`(${wordStarts})`, 'desc')
      .orderBy(sql`${nameText} like ${`${first}%`}`, 'desc');
    if (!byName) q = q.orderBy(sql`char_length(name)`);
    return q.orderBy(sql`lower(name)`).orderBy('id').limit(SEARCH_PAGE + 1).offset(offset).execute();
  });
  return {
    items: rows.slice(0, SEARCH_PAGE).map(r => ({ id: r.id, name: r.name, ...(r.brand ? { brand: r.brand } : {}), data: (r.data ?? {}) as CatalogData })),
    more: rows.length > SEARCH_PAGE,
  };
}
