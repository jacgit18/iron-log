import { PH_KEYS } from '../lib/data.js';
import type { Experiment, Stretch, StretchExperiment, SupplementItem, SupplementNutrient, SupplementServing, SupplementSlot } from '../types.ts';
import { MAX_NUTRIENT_ROWS, NUTRIENT_KEYS, NUTRIENT_UNITS } from './nutrientKeys.js';
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

// What is in one serving: nutrient rows (a known key and unit, a positive amount; one row per key and unit) and the serving size. Anything else is dropped.
const round3 = (n: number) => Math.round(n * 1000) / 1000;
function nutrientsOf(x: any): SupplementNutrient[] {
  if (!Array.isArray(x)) return [];
  const seen = new Set<string>(); const out: SupplementNutrient[] = [];
  for (const r of x) {
    if (out.length >= MAX_NUTRIENT_ROWS) break;
    if (!r || typeof r !== 'object' || !(NUTRIENT_KEYS as readonly unknown[]).includes(r.key) || !(NUTRIENT_UNITS as readonly unknown[]).includes(r.unit)) continue;
    const amount = typeof r.amount === 'number' ? round3(r.amount) : NaN;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e7 || seen.has(`${r.key}/${r.unit}`)) continue;
    seen.add(`${r.key}/${r.unit}`); out.push({ key: r.key, amount, unit: r.unit });
  }
  return out;
}
function servingOf(x: any): SupplementServing | null {
  if (!x || typeof x !== 'object' || typeof x.units !== 'number' || !Number.isFinite(x.units) || x.units <= 0 || x.units > 100) return null;
  return { units: round3(x.units), ...(str(x.form, 40) ? { form: str(x.form, 40) } : {}) };
}

// A supplement in the library or on the schedule. `slot` is morning, noon or night; anything else keeps it in the library only.
export function normSupplementItem(x: any, slot: unknown = x && x.slot): SupplementItem | null {
  if (!x || typeof x !== 'object' || !str(x.id, 60) || !str(x.n, 60)) return null;
  const catalogId = isCatalogId(x.catalogId) ? x.catalogId : null;
  return { id: x.id, n: str(x.n, 60), slot: SUPPLEMENT_SLOTS.includes(slot as SupplementSlot) ? (slot as SupplementSlot) : '', ...(str(x.dose, 40) ? { dose: str(x.dose, 40) } : {}), ...noteOf(x),
    ...(catalogId && str(x.brand, 60) ? { brand: str(x.brand, 60) } : {}), ...(catalogId ? { catalogId } : {}),
    ...(servingOf(x.serving) ? { serving: servingOf(x.serving)! } : {}), ...(nutrientsOf(x.nutrients).length ? { nutrients: nutrientsOf(x.nutrients) } : {}) };
}
