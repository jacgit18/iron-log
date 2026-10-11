import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/types.ts';
import type { CatalogData, CatalogKind, EquipmentKey, MuscleKey, MuscleTags } from '../../src/types.ts';

// catalog:import (ADR 030): fills catalog_items from a free dataset. Run by hand by the admin, after a backup; never from an API route.
// It writes as the owner (the API role cannot write the catalog). Without `apply` nothing is written; the result says what would be.
//
// An import upserts by catalog id. A row of the same source that is missing from the new list is retired (hidden from search), never
// deleted (ADR 026 rule 5); a retired row that comes back is restored. A second run over the same list changes nothing.

/** free-exercise-db at a pinned commit (ADR 028): a re-import of newer data is a deliberate change to this line. */
export const FEDB_COMMIT = 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5';
export const FEDB_URL = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${FEDB_COMMIT}/dist/exercises.json`;
export const FEDB_LICENSE = 'Unlicense';

/** A catalog row as the importer writes it. */
export interface CatalogRow {
  id: string;
  kind: CatalogKind;
  name: string;
  brand: string | null;
  data: CatalogData;
}

export interface Mapped {
  rows: CatalogRow[];
  /** Dataset values with no match in the app, and how many rows had each: `equipment:foo`, `muscle:neck`. */
  unmapped: Record<string, number>;
  /** Dataset rows left out, with why. */
  skipped: string[];
}

// The dataset's 17 muscle names → the app's muscle keys. `shoulders` does not say which head, so it counts for front and side delts
// (presses and raises, most of the dataset's shoulder rows). `neck` has no key in the app: reported, left out.
export const FEDB_MUSCLES: Record<string, MuscleKey[]> = {
  abdominals: ['abs'], abductors: ['abductors'], adductors: ['adductors'], biceps: ['biceps'], calves: ['calves'], chest: ['chest'],
  forearms: ['forearms'], glutes: ['glutes'], hamstrings: ['hamstrings'], lats: ['lats'], 'lower back': ['lowerback'],
  'middle back': ['upperback'], quadriceps: ['quads'], shoulders: ['frontdelt', 'sidedelt'], traps: ['traps'], triceps: ['triceps'],
};

// The dataset's equipment values → the app's equipment keys. A value not listed here becomes Other and is reported; none (null) stays
// empty, so the app shows it blank.
export const FEDB_EQUIPMENT: Record<string, EquipmentKey> = {
  'body only': 'bodyweight', machine: 'machine', other: 'other', 'foam roll': 'other', kettlebells: 'kettlebell', dumbbell: 'dumbbell',
  cable: 'cable', barbell: 'barbell', bands: 'band', 'medicine ball': 'medball', 'exercise ball': 'other', 'e-z curl bar': 'ezbar',
};

// A catalog id is what cards and log rows store, and those allow 100 characters: `c:fedb:` plus at most 90.
const ID_PART = /^[A-Za-z0-9_-]{1,90}$/;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((s): s is string => s !== null) : []);

/** Maps free-exercise-db's exercises.json to catalog rows. A `stretching` row is a stretch, every other one an exercise (ADR 028). */
export function mapFedb(input: unknown): Mapped {
  if (!Array.isArray(input)) throw new Error('free-exercise-db: expected an array of exercises');
  const unmapped: Record<string, number> = {};
  const note = (key: string) => { unmapped[key] = (unmapped[key] ?? 0) + 1; };
  const skipped: string[] = [];
  const seen = new Set<string>();
  const rows: CatalogRow[] = [];

  const muscles = (names: string[]): MuscleKey[] => {
    const out: MuscleKey[] = [];
    for (const name of names) {
      const key = name.toLowerCase();
      if (!Object.hasOwn(FEDB_MUSCLES, key)) { note(`muscle:${name}`); continue; }
      for (const k of FEDB_MUSCLES[key]!) if (!out.includes(k)) out.push(k);
    }
    return out;
  };

  for (const raw of input as unknown[]) {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const dsId = str(r.id);
    const name = str(r.name);
    if (!dsId || !ID_PART.test(dsId)) { skipped.push(`bad id: ${JSON.stringify(r.id)}`); continue; }
    if (!name || name.length > 300) { skipped.push(`${dsId}: bad name`); continue; }
    if (seen.has(dsId)) { skipped.push(`${dsId}: duplicate id`); continue; }
    seen.add(dsId);

    const category = str(r.category)?.toLowerCase() ?? null;
    const eqRaw = str(r.equipment)?.toLowerCase() ?? null;
    let eq: EquipmentKey | null = null;
    if (eqRaw) {
      // Own keys only: a value such as `constructor` must not pick up an inherited property.
      if (Object.hasOwn(FEDB_EQUIPMENT, eqRaw)) eq = FEDB_EQUIPMENT[eqRaw]!;
      else { eq = 'other'; note(`equipment:${eqRaw}`); }
    }
    const p = muscles(strings(r.primaryMuscles));
    const s = muscles(strings(r.secondaryMuscles)).filter(k => !p.includes(k));
    const tags: MuscleTags = {};
    if (p.length) tags.p = p;
    if (s.length) tags.s = s;
    // A stretch is mobility work: it shows its muscles but does not count toward their volume, as everywhere else in the app.
    if (category === 'stretching') tags.mob = true;

    const data: CatalogData = { eq, muscles: tags, force: str(r.force), mechanic: str(r.mechanic), instructions: strings(r.instructions) };
    const level = str(r.level);
    if (level) data.level = level;
    if (category) data.category = category;
    rows.push({ id: `c:fedb:${dsId}`, kind: category === 'stretching' ? 'stretch' : 'exercise', name, brand: null, data });
  }
  return { rows, unmapped, skipped };
}

// ---------- NIH Dietary Supplement Label Database (ADR 029) ----------
// About 120,000 on-market products, read through the public API (no key). The API stops paging at 10,000 results, so the products are
// read in slices: one entry year at a time, a big year split by supplement form, and a big form by product type. Before anything is
// written, every slice must return exactly as many distinct products as it says it holds, and the slices must add up to the on-market
// total: a short download would otherwise retire real rows.

export const DSLD_API = 'https://api.ods.od.nih.gov/dsld/v9';
export const DSLD_LICENSE = 'US government data (NIH ODS DSLD), terms not stated (checked 2026-10-11)';
const DSLD_FORMS = ['e0164', 'e0159', 'e0161', 'e0155', 'e0176', 'e0165', 'e0174', 'e0162', 'e0172', 'e0177'];
const DSLD_TYPES = ['a1305', 'a1306', 'a1326', 'a1310', 'a1302', 'a1299', 'a1316', 'a1315', 'a1317', 'a1309', 'a1325'];
const DSLD_SLICE_MAX = 9000;
const DSLD_PAGE = 1000;

export interface DsldDeps {
  /** GET a URL and parse its JSON (the CLI adds a timeout and retries). */
  fetchJson(url: string): Promise<unknown>;
  /** Pause between requests, to be gentle with a free public API. */
  sleep?(ms: number): Promise<void>;
  log?(msg: string): void;
  years?: [number, number];
}
export interface DsldHit { _id: string; _source: Record<string, unknown> }

const searchUrl = (params: Record<string, string | number>) =>
  `${DSLD_API}/search-filter?${new URLSearchParams({ q: '*', status: '1', ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) })}`;

/** Every on-market DSLD product, or an error when the download is not complete. */
export async function fetchDsld({ fetchJson, sleep = async () => {}, log = () => {}, years = [2000, new Date().getFullYear()] }: DsldDeps): Promise<DsldHit[]> {
  const get = async (params: Record<string, string | number>) => { const r = await fetchJson(searchUrl(params)); await sleep(250); return r as { hits?: unknown[]; stats?: { count?: unknown } }; };
  const count = async (params: Record<string, string | number>) => {
    const n = (await get({ ...params, size: 0 })).stats?.count;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) throw new Error(`DSLD: no count for ${JSON.stringify(params)}`);
    return n;
  };

  const total = await count({});
  const slices: { params: Record<string, string | number>; n: number }[] = [];
  for (let y = years[0]; y <= years[1]; y++) {
    const year = { date_start: y, date_end: y };
    const n = await count(year);
    if (!n) continue;
    if (n <= DSLD_SLICE_MAX) { slices.push({ params: year, n }); continue; }
    for (const form of DSLD_FORMS) {
      const byForm = { ...year, supplement_form: form };
      const m = await count(byForm);
      if (!m) continue;
      if (m <= DSLD_SLICE_MAX) { slices.push({ params: byForm, n: m }); continue; }
      let sum = 0;
      for (const type of DSLD_TYPES) {
        const byType = { ...byForm, product_type: type };
        const k = await count(byType);
        if (k > DSLD_SLICE_MAX) throw new Error(`DSLD: ${JSON.stringify(byType)} still holds ${k} products; slice it further`);
        if (k) { slices.push({ params: byType, n: k }); sum += k; }
      }
      if (sum !== m) throw new Error(`DSLD: ${y} ${form} holds ${m} products but its product types add up to ${sum}`);
    }
  }
  const sliced = slices.reduce((a, s) => a + s.n, 0);
  if (sliced !== total) throw new Error(`DSLD: ${total} on-market products, but the slices add up to ${sliced} (years ${years[0]}-${years[1]})`);
  log(`DSLD: ${total} on-market products in ${slices.length} slices`);

  const out = new Map<string, DsldHit>();
  for (const [i, s] of slices.entries()) {
    const ids = new Set<string>();
    for (let from = 0; from < s.n; from += DSLD_PAGE) {
      const hits = (await get({ ...s.params, sort_by: 'entryDate', sort_order: 'asc', size: DSLD_PAGE, from })).hits ?? [];
      for (const h of hits as DsldHit[]) {
        if (!h || typeof h._id !== 'string' || !h._source || typeof h._source !== 'object') continue;
        ids.add(h._id); out.set(h._id, h);
      }
    }
    if (ids.size !== s.n) throw new Error(`DSLD: slice ${JSON.stringify(s.params)} says ${s.n} products but returned ${ids.size} distinct ones`);
    log(`DSLD: slice ${i + 1}/${slices.length} (${s.n})`);
  }
  if (out.size !== total) throw new Error(`DSLD: ${total} on-market products, but ${out.size} distinct ones were read`);
  return [...out.values()];
}

/** Maps DSLD products to catalog rows: name, brand and form only (ADR 029: no ingredients, no amounts). */
export function mapDsld(hits: DsldHit[]): Mapped {
  const rows: CatalogRow[] = []; const skipped: string[] = []; const seen = new Set<string>();
  for (const h of hits) {
    const id = String(h?._id ?? '');
    const src = (h?._source ?? {}) as Record<string, unknown>;
    const name = str(src.fullName);
    if (!/^[0-9]{1,20}$/.test(id)) { skipped.push(`bad id: ${JSON.stringify(h?._id)}`); continue; }
    if (!name || name.length > 300) { skipped.push(`${id}: bad name`); continue; }
    if (seen.has(id)) { skipped.push(`${id}: duplicate id`); continue; }
    seen.add(id);
    const brand = str(src.brandName);
    const state = src.physicalState && typeof src.physicalState === 'object' ? (src.physicalState as Record<string, unknown>) : {};
    const form = str(state.langualCodeDescription);
    rows.push({ id: `c:dsld:${id}`, kind: 'supplement', name, brand: brand && brand.length <= 300 ? brand : null, data: form && form.length <= 100 ? { form } : {} });
  }
  return { rows, unmapped: {}, skipped };
}

export interface ImportOptions {
  source: string;
  license: string;
  rows: CatalogRow[];
  apply: boolean;
  /** Let one run retire more than a fifth of the source's live rows (a shrunken or broken download otherwise stops here). */
  allowMassRetire?: boolean;
}

export interface ImportResult {
  applied: boolean;
  source: string;
  /** Ids added, changed (or restored from retired), and retired by this run; `unchanged` is a count. */
  added: string[];
  changed: string[];
  retired: string[];
  unchanged: number;
}

// jsonb does not keep key order, so rows are compared by value with keys sorted.
const stable = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);

export async function importCatalog(db: Kysely<DB>, { source, license, rows, apply, allowMassRetire = false }: ImportOptions): Promise<ImportResult> {
  if (!rows.length) throw new Error(`catalog:import ${source}: the new list is empty; refusing to retire every row`);
  const prefix = `c:${source}:`;
  const bad = rows.find(r => !r.id.startsWith(prefix));
  if (bad) throw new Error(`catalog:import ${source}: ${bad.id} is not a ${prefix} id`);

  return db.transaction().execute(async trx => {
    // One import at a time: a second run waits here instead of interleaving.
    await sql`select pg_advisory_xact_lock(hashtext('catalog_import'))`.execute(trx);
    const existing = new Map((await trx.selectFrom('catalog_items').selectAll().where('source', '=', source).execute()).map(r => [r.id, r]));
    const added: CatalogRow[] = [];
    const changed: CatalogRow[] = [];
    let unchanged = 0;
    const incoming = new Set<string>();
    for (const row of rows) {
      incoming.add(row.id);
      const old = existing.get(row.id);
      if (!old) added.push(row);
      else if (old.retired_at || old.kind !== row.kind || old.name !== row.name || old.brand !== row.brand || old.license !== license
        || stable(old.data) !== stable(row.data)) changed.push(row);
      else unchanged++;
    }
    const live = [...existing.values()].filter(r => !r.retired_at);
    const retired = live.filter(r => !incoming.has(r.id)).map(r => r.id);
    if (retired.length > live.length / 5 && !allowMassRetire) {
      throw new Error(`catalog:import ${source}: would retire ${retired.length} of ${live.length} live rows; check the download, or pass --allow-mass-retire`);
    }

    if (apply) {
      for (let i = 0; i < added.length; i += 200) {
        await trx.insertInto('catalog_items')
          .values(added.slice(i, i + 200).map(r => ({ id: r.id, kind: r.kind, source, license, name: r.name, brand: r.brand, data: JSON.stringify(r.data) })))
          .execute();
      }
      for (const r of changed) {
        await trx.updateTable('catalog_items')
          .set({ kind: r.kind, license, name: r.name, brand: r.brand, data: JSON.stringify(r.data), retired_at: null, updated_at: sql`now()` })
          .where('id', '=', r.id).execute();
      }
      if (retired.length) {
        await trx.updateTable('catalog_items').set({ retired_at: sql`now()`, updated_at: sql`now()` }).where('id', 'in', retired).execute();
      }
    }
    return { applied: apply, source, added: added.map(r => r.id), changed: changed.map(r => r.id), retired, unchanged };
  });
}
