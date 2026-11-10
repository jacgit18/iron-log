import type { CatalogItem, SupplementItem } from '../types.ts';
import type { MineOption } from './picker.js';
import { slotLabel } from './supplements.js';

// The lines of the supplement add sheet's results (brief supplement-add-redesign): what tells two listings of one product apart.

/** The grey line under a catalog result: brand, form, label year ("Nature Made · Tablet · 2020 label"). */
export const catalogLine = (c: CatalogItem): string =>
  [c.brand, c.data.form, c.data.entryYear ? `${c.data.entryYear} label` : ''].filter(Boolean).join(' · ') || 'No brand';

/** The UPC of a picked catalog result, for its card; empty when the import has not stored one. */
export const upcLine = (c: CatalogItem): string => (c.data.upc ? `UPC ${c.data.upc}` : '');

/** The same results, newest label first within one name and brand (the sort the picker applies keeps this order for ties). */
export const newestFirst = (items: CatalogItem[]): CatalogItem[] =>
  [...items].sort((a, b) => (b.data.entryYear ?? 0) - (a.data.entryYear ?? 0));

/** One of yours as the sheet lists it: where it is now and its dose; badged Library or Custom only when syncing (ADR 027). */
export const mineOption = (i: SupplementItem, syncing: boolean): MineOption => ({
  id: i.id, name: i.n, ...(i.brand ? { brand: i.brand } : {}), ...(i.catalogId ? { catalogId: i.catalogId } : {}),
  meta: [i.brand, i.slot ? `In ${slotLabel(i.slot)}` : 'Library only', i.dose].filter(Boolean).join(' · '),
  ...(syncing ? { badge: i.catalogId ? 'Library' : 'Custom' } : {}),
});

/** Your own items with one entry per supplement (instances taken at several times of day share a name and brand). */
export const oneOfEach = (items: SupplementItem[]): SupplementItem[] => {
  const seen = new Set<string>();
  return items.filter(i => { const k = `${i.n.toLowerCase()}\u0000${(i.brand || '').toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; });
};
