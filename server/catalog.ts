import { sql, type Kysely } from 'kysely';
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
// server looks them up. Every word must appear in the name or brand (any case); names starting with the first word come first, then
// shorter names. One page of SEARCH_PAGE at a time, `more` when there is another. The trigram index (migration
// 20261011000002) covers the same expression, so this stays fast.

export const SEARCHED_KINDS: readonly CatalogKind[] = ['supplement'];
export const SEARCH_PAGE = 30;
const MAX_OFFSET = 600;

export interface CatalogSearch { kind: CatalogKind; words: string[]; offset: number }
export interface CatalogSearchResult { items: (CatalogListItem & { brand?: string })[]; more: boolean }

/** The search a query asks for, or null when it is not one we answer. */
export function parseSearch(query: Record<string, unknown>): CatalogSearch | null {
  const kind = SEARCHED_KINDS.find(k => k === query.kind);
  if (!kind || typeof query.q !== 'string') return null;
  const words = query.q.toLowerCase().split(/\s+/).filter(Boolean);
  if (query.q.trim().length < 2 || query.q.length > 100 || words.length > 6) return null;
  const raw = query.offset ?? '0';
  if (typeof raw !== 'string' || !/^\d{1,4}$/.test(raw) || Number(raw) > MAX_OFFSET) return null;
  return { kind, words, offset: Number(raw) };
}

// A typed word, matched literally: % and _ are LIKE wildcards, and a backslash escapes them.
const escapeLike = (w: string) => w.replace(/[\\%_]/g, c => `\\${c}`);

export async function searchCatalog(db: Kysely<DB>, userId: string, { kind, words, offset }: CatalogSearch): Promise<CatalogSearchResult> {
  const text = sql<string>`lower(name || ' ' || coalesce(brand, ''))`;
  const rows = await inUserTransaction(db, userId, trx => {
    let q = trx.selectFrom('catalog_items').select(['id', 'name', 'brand', 'data'])
      .where('kind', '=', kind).where('retired_at', 'is', null);
    for (const w of words) q = q.where(text, 'like', `%${escapeLike(w)}%`);
    return q.orderBy(sql`lower(name) like ${`${escapeLike(words[0]!)}%`}`, 'desc')
      .orderBy(sql`char_length(name)`).orderBy(sql`lower(name)`).orderBy('id')
      .limit(SEARCH_PAGE + 1).offset(offset).execute();
  });
  return {
    items: rows.slice(0, SEARCH_PAGE).map(r => ({ id: r.id, name: r.name, ...(r.brand ? { brand: r.brand } : {}), data: (r.data ?? {}) as CatalogData })),
    more: rows.length > SEARCH_PAGE,
  };
}
