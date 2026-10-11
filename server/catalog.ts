import type { Kysely } from 'kysely';
import type { CatalogData, CatalogKind } from '../src/types.ts';
import { inUserTransaction } from './auth.ts';
import type { DB } from './db/types.ts';

// GET /api/catalog?kind=exercise|stretch (ADR 025): the whole list of one kind, live rows only, in name order, for browsing and adding.
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
