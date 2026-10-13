/* What the item picker lists for the words typed (ADR 036, spec inline-catalog-picker): your own items, then catalog items you do not have
   yet, then a row to create a new one. Pure, so the order and the duplicate rules are tested without a browser. */
import type { CatalogItem } from '../types.ts';

/** One of your own items as the picker shows it. `badge` is Custom or Library (ADR 027); `meta` is the grey line under the name. */
export interface MineOption { id: string; name: string; brand?: string; catalogId?: string; badge?: string; meta?: string }

/** What the catalog part of the picker has to show. `off`: not syncing, so there is no catalog (ADR 025) and the group is left out. */
export type CatalogState =
  | { status: 'off' }
  | { status: 'short' } // too few letters for a server search
  | { status: 'loading' }
  | { status: 'failed'; reason: 'offline' | 'refused' | 'unreachable' }
  | { status: 'ready'; items: CatalogItem[]; more?: boolean };

export type PickerChoice = { kind: 'mine'; id: string } | { kind: 'catalog'; item: CatalogItem } | { kind: 'create'; name: string };

export interface PickerGroup<T> { shown: T[]; hidden: number }
export interface PickerOptions { mine: PickerGroup<MineOption>; catalog: PickerGroup<CatalogItem>; create: string | null }

export const pickerKey = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const sameItem = (a: { name: string; brand?: string }, b: { name: string; brand?: string }, byBrand: boolean) =>
  pickerKey(a.name) === pickerKey(b.name) && (!byBrand || pickerKey(a.brand) === pickerKey(b.brand));

// Every word typed is somewhere in the name (or brand); a name that starts with what is typed comes first, then A to Z.
const matches = (words: string[], ...fields: (string | undefined)[]) => { const hay = pickerKey(fields.filter(Boolean).join(' ')); return words.every(w => hay.includes(w)); };
const rank = <T>(list: T[], q: string, name: (x: T) => string) =>
  [...list].sort((a, b) => Number(!pickerKey(name(a)).startsWith(q)) - Number(!pickerKey(name(b)).startsWith(q)) || name(a).localeCompare(name(b)));

const cap = <T>(list: T[], max: number): PickerGroup<T> => ({ shown: list.slice(0, max), hidden: Math.max(0, list.length - max) });

/**
 * The picker's groups for `q`. `byBrand` (supplements): a catalog item is a duplicate only when name and brand both match, as the store
 * judges it (two products may share a name). `serverFiltered`: the catalog items already match `q` (the supplement search), so they are
 * not filtered again. With nothing typed, your items are listed and the catalog is not.
 */
export function pickerOptions(q: string, mine: MineOption[], catalog: CatalogItem[], opts: { max?: number; byBrand?: boolean; serverFiltered?: boolean } = {}): PickerOptions {
  const max = opts.max ?? 8; const byBrand = !!opts.byBrand;
  const k = pickerKey(q); const words = k ? k.split(' ') : [];
  const mineShown = rank(mine.filter(m => matches(words, m.name, byBrand ? m.brand : undefined)), k, m => m.name);
  const have = new Set(mine.map(m => m.catalogId).filter(Boolean));
  const fromCatalog = !k ? [] : catalog.filter(c => !have.has(c.id) && !mine.some(m => sameItem(m, c, byBrand))
    && (opts.serverFiltered || matches(words, c.name, byBrand ? c.brand : undefined)));
  const exact = !!k && mine.some(m => pickerKey(m.name) === k);
  return { mine: cap(mineShown, max), catalog: cap(rank(fromCatalog, k, c => c.name), max), create: k && !exact ? String(q).trim().replace(/\s+/g, ' ') : null };
}
