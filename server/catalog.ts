import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { CatalogData, CatalogKind } from '../src/types.ts';
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

export const SEARCHED_KINDS: readonly CatalogKind[] = ['supplement'];
export const SEARCH_PAGE = 30;
const MAX_OFFSET = 600;

export interface CatalogSearch { kind: CatalogKind; words: string[]; offset: number }
export interface CatalogSearchResult { items: (CatalogListItem & { brand?: string })[]; more: boolean }

/** The words of a text as the search compares them: lower case, apostrophes dropped, other punctuation as spaces. */
export const searchWords = (text: string) => text.toLowerCase().replace(/['’]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** The search a query asks for, or null when it is not one we answer. */
export function parseSearch(query: Record<string, unknown>): CatalogSearch | null {
  const kind = SEARCHED_KINDS.find(k => k === query.kind);
  if (!kind || typeof query.q !== 'string') return null;
  const words = searchWords(query.q);
  if (query.q.trim().length < 2 || query.q.length > 100 || words.length > 6) return null;
  const raw = query.offset ?? '0';
  if (typeof raw !== 'string' || !/^\d{1,4}$/.test(raw) || Number(raw) > MAX_OFFSET) return null;
  return { kind, words, offset: Number(raw) };
}

// A typed word, matched literally: % and _ are LIKE wildcards, and a backslash escapes them (words are letters and digits only, so
// this is a guard).
const escapeLike = (w: string) => w.replace(/[\\%_]/g, c => `\\${c}`);

// The same text the index is built on (keep in step with migration 20261016000001).
const normalized = (expr: RawBuilder<string>) =>
  sql<string>`lower(regexp_replace(regexp_replace(${expr}, ${sql.lit("['’]")}, '', 'g'), ${sql.lit('[^[:alnum:]]+')}, ' ', 'g'))`;

export async function searchCatalog(db: Kysely<DB>, userId: string, { kind, words, offset }: CatalogSearch): Promise<CatalogSearchResult> {
  if (!words.length) return { items: [], more: false };
  const text = normalized(sql`name || ' ' || coalesce(brand, '')`);
  const nameText = normalized(sql`name`);
  const phrase = escapeLike(words.join(' '));
  const wordStarts = sql.join(words.map(w => sql`(' ' || ${text}) like ${`% ${escapeLike(w)}%`}`), sql` and `);
  const rows = await inUserTransaction(db, userId, trx => {
    let q = trx.selectFrom('catalog_items').select(['id', 'name', 'brand', 'data'])
      .where('kind', '=', kind).where('retired_at', 'is', null);
    for (const w of words) q = q.where(text, 'like', `%${escapeLike(w)}%`);
    return q.orderBy(sql`${nameText} like ${`${phrase}%`}`, 'desc')
      .orderBy(sql`(${wordStarts})`, 'desc')
      .orderBy(sql`${nameText} like ${`${escapeLike(words[0]!)}%`}`, 'desc')
      .orderBy(sql`char_length(name)`).orderBy(sql`lower(name)`).orderBy('id')
      .limit(SEARCH_PAGE + 1).offset(offset).execute();
  });
  return {
    items: rows.slice(0, SEARCH_PAGE).map(r => ({ id: r.id, name: r.name, ...(r.brand ? { brand: r.brand } : {}), data: (r.data ?? {}) as CatalogData })),
    more: rows.length > SEARCH_PAGE,
  };
}
