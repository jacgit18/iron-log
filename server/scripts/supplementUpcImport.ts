import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/types.ts';
import { cleanGtin } from '../../src/shared/barcode.ts';
import { DSLD_API, dsldAliases, type DsldHit } from './catalogImport.ts';

// catalog:upcs (brief supplement-barcode-search, ADR 117): fills supplement_upcs, the UPC printed on a bottle mapped to the supplement row the catalog shows for it. NIH DSLD cannot be searched by UPC and its
// search results carry none, so every on-market label is asked for its `upcSku` one at a time (about 122,000 calls, politely and resumably). Each label's UPC points at the row the catalog import kept for that label
// (dsldAliases), because that import keeps one row per name, brand, form and label year. When several labels share a UPC the newest label wins. Run by hand by the admin after the catalog import, never from an API route.
// Without `apply` nothing is written. A run that could not read every label writes nothing: run it again, the cache file resumes it.

const LABEL_ID = /^[0-9]{1,20}$/;

/** Brands whose labels are always crawled, whatever year (the owner's own: Thorne and Sports Research, then big sellers). A brand matches when the label's brand name starts with it, case-insensitively, so `thorne` covers Thorne, Thorne Research and Thorne HealthTech. */
export const PRIORITY_BRANDS = ['thorne', 'sports research', 'nature made', 'now foods', 'garden of life', 'pure encapsulations', 'life extension', 'nordic naturals', 'jarrow', "doctor's best", 'solgar', 'optimum nutrition', 'centrum', 'one a day', 'nature\'s bounty', 'swanson', 'vitafusion', 'olly', 'transparent labs', 'momentous'];

/** What the search results say about a label (entry year and brand); `hits` carry no UPC. */
const yearOf = (h: DsldHit) => Number(String((h._source as Record<string, unknown>).entryDate ?? '').slice(0, 4)) || 0;
const brandOf = (h: DsldHit) => String((h._source as Record<string, unknown>).brandName ?? '').trim().toLowerCase();

export interface LabelScope {
  /** Labels entered in this year or later are in scope (undefined: no year rule). */
  since?: number;
  /** Labels of these brands are in scope at any year, and are read first. */
  brands: string[];
}

/** True when the label's brand is one of the priority brands. */
export const isPriorityBrand = (h: DsldHit, brands: string[]) => { const b = brandOf(h); return !!b && brands.some(p => b.startsWith(p.toLowerCase())); };

/** True when a crawl limited to `scope` reads this label. */
export const inScope = (h: DsldHit, { since, brands }: LabelScope) => isPriorityBrand(h, brands) || (since !== undefined && yearOf(h) >= since);

/** The few fields the crawl needs from a search result, so the downloaded list can be kept in a small cache file (the full results are hundreds of megabytes). */
export function slimHit(h: DsldHit): DsldHit {
  const s = (h._source ?? {}) as Record<string, unknown>;
  const state = s.physicalState && typeof s.physicalState === 'object' ? (s.physicalState as Record<string, unknown>) : {};
  return { _id: h._id, _source: { fullName: s.fullName, brandName: s.brandName, entryDate: s.entryDate, physicalState: { langualCodeDescription: state.langualCodeDescription } } };
}

/** The UPC a DSLD label carries, as 14 digits, or null when it has none or it is not a valid product code (NIH writes it with spaces: `0 74306 80004 6`). */
export function upcOfLabel(label: unknown): string | null {
  const raw = label && typeof label === 'object' ? (label as Record<string, unknown>).upcSku : undefined;
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[\s-]/g, '');
  return /^\d+$/.test(digits) ? cleanGtin(digits) : null;
}

export interface UpcCrawlDeps {
  /** GET a label by id and parse it; null for a 404. May retry and pace itself (the CLI does). Throws when it cannot be read. */
  fetchLabel(id: string): Promise<unknown>;
  /** What an earlier run already read: DSLD id to UPC (or '' for a label with none). */
  known?: Map<string, string>;
  /** Called with each label as it is read, so a cache file can keep it. */
  learned?(id: string, upc: string | null): void;
  concurrency?: number;
  limit?: number;
  /** Read only labels in this scope (priority brands first). Without it every on-market label is read. */
  scope?: LabelScope;
  log?(msg: string): void;
}

export interface UpcCrawl {
  /** UPC (14 digits) to the catalog id to show for it. */
  pairs: Map<string, string>;
  read: number;
  withoutUpc: number;
  failed: string[];
  /** Labels this run asked about (the rest came from the cache). */
  asked: number;
  /** UPCs that more than one label carries (the newest label won each). */
  shared: number;
  /** Labels the crawl was meant to read (all of them, or the ones in scope). */
  inScope: number;
}

export interface CrawlScopeCounts { onMarket: number; inScope: number; priorityBrand: number; cached: number; toRead: number }

/** How many labels a crawl would read, from the search results alone (no label is asked for). */
export function crawlScope(hits: DsldHit[], known: Map<string, string>, scope?: LabelScope): CrawlScopeCounts {
  const { ids } = scopedIds(hits, scope);
  const cached = ids.filter(id => known.has(id)).length;
  const wanted = new Set(ids);
  const priorityBrand = scope ? hits.filter(h => isPriorityBrand(h, scope.brands) && wanted.has(String(h._id))).length : 0;
  return { onMarket: dsldAliases(hits).size, inScope: ids.length, priorityBrand, cached, toRead: ids.length - cached };
}

function scopedIds(hits: DsldHit[], scope?: LabelScope) {
  const alias = dsldAliases(hits);
  const byId = new Map(hits.map(h => [String(h._id), h]));
  const wanted = (id: string) => LABEL_ID.test(id) && (!scope || inScope(byId.get(id)!, scope));
  const first = (id: string) => (scope && isPriorityBrand(byId.get(id)!, scope.brands) ? 0 : 1);
  // priority brands first, then by id, so a stopped run has read the brands that matter most
  const ids = [...alias.keys()].filter(wanted).sort((a, b) => first(a) - first(b) || Number(a) - Number(b));
  return { alias, ids };
}

const entryTime = (h: DsldHit) => Date.parse(String((h._source as Record<string, unknown>).entryDate ?? '')) || 0;

/** Reads every label's UPC and maps it to the catalog row kept for that label. */
export async function crawlUpcs(hits: DsldHit[], { fetchLabel, known = new Map(), learned, concurrency = 3, limit, scope, log = () => {} }: UpcCrawlDeps): Promise<UpcCrawl> {
  const { alias, ids } = scopedIds(hits, scope);
  const when = new Map(hits.map(h => [String(h._id), entryTime(h)]));
  const upcOf = new Map<string, string | null>();
  for (const id of ids) { const k = known.get(id); if (k !== undefined) upcOf.set(id, k || null); }
  const todo = ids.filter(id => !upcOf.has(id)).slice(0, limit);
  const failed: string[] = [];
  let next = 0, done = 0;
  const worker = async () => {
    for (let id = todo[next++]; id !== undefined; id = todo[next++]) {
      try {
        const label = await fetchLabel(id);
        const upc = label === null ? null : upcOfLabel(label);
        upcOf.set(id, upc); learned?.(id, upc);
      } catch { failed.push(id); }
      if (++done % 1000 === 0) log(`catalog:upcs: ${done} of ${todo.length} labels asked`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  const pairs = new Map<string, string>(), from = new Map<string, string>();
  let withoutUpc = 0, shared = 0;
  for (const id of ids) {
    if (!upcOf.has(id)) continue; // not read: failed, or past --limit
    const upc = upcOf.get(id);
    if (!upc) { withoutUpc++; continue; }
    const holder = from.get(upc);
    if (holder === undefined) { from.set(upc, id); pairs.set(upc, alias.get(id)!); continue; }
    shared++;
    const newer = (when.get(id) ?? 0) > (when.get(holder) ?? 0) || ((when.get(id) ?? 0) === (when.get(holder) ?? 0) && Number(id) > Number(holder));
    if (newer) { from.set(upc, id); pairs.set(upc, alias.get(id)!); }
  }
  return { pairs, read: upcOf.size, withoutUpc, failed, asked: todo.length, shared, inScope: ids.length };
}

export interface UpcImportResult { applied: boolean; added: number; changed: number; removed: number; unchanged: number; noCatalogRow: number }

/** Writes the pairs to supplement_upcs (as the owner, in one transaction): upsert, and (with `prune`, the default, for a full crawl) remove a UPC no label carries any more. Pairs for a catalog id that is not live are left out and counted. */
export async function importUpcs(db: Kysely<DB>, pairs: Map<string, string>, { apply, prune = true }: { apply: boolean; prune?: boolean }): Promise<UpcImportResult> {
  if (!pairs.size) throw new Error('catalog:upcs: no UPCs read; refusing to remove every row');
  return db.transaction().execute(async trx => {
    await sql`select pg_advisory_xact_lock(hashtext('catalog_upcs'))`.execute(trx);
    const live = new Set((await trx.selectFrom('catalog_items').select('id').where('source', '=', 'dsld').where('retired_at', 'is', null).execute()).map(r => r.id));
    const want = new Map([...pairs].filter(([, id]) => live.has(id)));
    const noCatalogRow = pairs.size - want.size;
    const have = new Map((await trx.selectFrom('supplement_upcs').select(['upc', 'catalog_id']).execute()).map(r => [r.upc, r.catalog_id]));
    const add = [...want].filter(([u]) => !have.has(u)), change = [...want].filter(([u, id]) => have.has(u) && have.get(u) !== id);
    // a crawl limited to a scope never saw the other labels, so it must not remove their UPCs
    const remove = prune ? [...have.keys()].filter(u => !want.has(u)) : [];
    if (apply) {
      for (let i = 0; i < add.length; i += 1000) await trx.insertInto('supplement_upcs').values(add.slice(i, i + 1000).map(([upc, catalog_id]) => ({ upc, catalog_id }))).execute();
      for (const [upc, catalog_id] of change) await trx.updateTable('supplement_upcs').set({ catalog_id, imported_at: sql`now()` }).where('upc', '=', upc).execute();
      for (let i = 0; i < remove.length; i += 1000) await trx.deleteFrom('supplement_upcs').where('upc', 'in', remove.slice(i, i + 1000)).execute();
    }
    return { applied: apply, added: add.length, changed: change.length, removed: remove.length, unchanged: want.size - add.length - change.length, noCatalogRow };
  });
}

export const labelUrl = (id: string) => `${DSLD_API}/label/${id}`;
