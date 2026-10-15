import { PH_KEYS } from '../lib/data.js';
import type { Experiment, Stretch, StretchExperiment, SupplementItem, SupplementSlot } from '../types.ts';
import { goodUrl, str } from './stretchWeek.js';

/* ---------- One item of a small list: a stretch, a stretch experiment ----------
   Each cleaner takes anything and returns the clean item, or null when it can't be used (the caller drops
   duplicate ids). Framework-free, so the client and the API share the rules (ADR 015). */

export const DEFAULT_GROUP = 'Other';

const urlOf = (x: any) => (goodUrl(str(x.url, 500)) && str(x.url, 500) ? { url: str(x.url, 500) } : {});
const noteOf = (x: any, max = 200) => (str(x.note, max) ? { note: str(x.note, max) } : {});

// A catalog id as catalog:import makes them (`c:<source>:<dataset id>`, at most 100 characters); anything else is dropped, so the stretch or supplement is Custom.
// The store checks ids with the same function, so an id it accepts is never stripped later by the server or a sync pull.
const CATALOG_ID = /^c:[a-z]{2,20}:[A-Za-z0-9_-]{1,90}$/;
export const isCatalogId = (id: unknown): id is string => typeof id === 'string' && id.length <= 100 && CATALOG_ID.test(id);
export function normStretchItem(x: any): Stretch | null {
  if (!x || typeof x !== 'object' || !str(x.id, 60) || !str(x.n, 80)) return null;
  const catalogId = isCatalogId(x.catalogId) ? x.catalogId : null;
  return { id: x.id, n: str(x.n, 80), group: str(x.group, 40) || DEFAULT_GROUP, tier: x.tier === 'primary' || x.tier === 'secondary' ? x.tier : '', ...urlOf(x), ...noteOf(x), ...(catalogId ? { catalogId } : {}) };
}

export function normStretchExperimentItem(x: any): StretchExperiment | null {
  if (!x || typeof x !== 'object' || !str(x.id, 60) || !str(x.n, 80)) return null;
  return { id: x.id, n: str(x.n, 80), ...urlOf(x), ...noteOf(x), ...(str(x.group, 40) ? { group: str(x.group, 40) } : {}) };
}

// An exercise to try: an Experiment list entry.
export function normExperimentItem(e: any): Experiment | null {
  if (!e || typeof e.id !== 'string' || e.id === '' || e.id.length > 200 || typeof e.ex !== 'string' || e.ex === '') return null;
  if (!(e.ph == null || PH_KEYS.includes(e.ph)) || !(e.note == null || typeof e.note === 'string')) return null;
  return { id: e.id, ex: e.ex, ph: e.ph ?? null, note: (e.note || '').slice(0, 200) };
}

export const SUPPLEMENT_SLOTS: SupplementSlot[] = ['morning', 'noon', 'night'];

// A supplement in the library or on the schedule. `slot` is morning, noon or night; anything else keeps it in the library only.
export function normSupplementItem(x: any, slot: unknown = x && x.slot): SupplementItem | null {
  if (!x || typeof x !== 'object' || !str(x.id, 60) || !str(x.n, 60)) return null;
  const catalogId = isCatalogId(x.catalogId) ? x.catalogId : null;
  return { id: x.id, n: str(x.n, 60), slot: SUPPLEMENT_SLOTS.includes(slot as SupplementSlot) ? (slot as SupplementSlot) : '', ...(str(x.dose, 40) ? { dose: str(x.dose, 40) } : {}), ...noteOf(x),
    ...(catalogId && str(x.brand, 60) ? { brand: str(x.brand, 60) } : {}), ...(catalogId ? { catalogId } : {}) };
}
