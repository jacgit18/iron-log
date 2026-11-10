// Coverage check for the supplement barcode search (brief supplement-barcode-search, build step 1). For each UPC: does USDA or Open Food Facts name the product, and does a
// search of NIH's label database for that name and brand find a listing? Read-only; asks the same sources the route does. Needs USDA_API_KEY and OFF_CONTACT in the environment
// (scripts/supplement-barcode-coverage.sh fetches them itself). The UPCs, names and key are printed nowhere but your own terminal.
//
//   scripts/supplement-barcode-coverage.sh --dsld 10          10 labels with a UPC from NIH (a spread of years)
//   scripts/supplement-barcode-coverage.sh --file bottles.txt  your own UPCs, one a line (spaces and dashes are fine)
import { readFileSync } from 'node:fs';
import { cleanGtin, nameForGtin, type ProductName } from '../src/shared/barcode.ts';
import { offName } from '../src/shared/offFood.ts';

const key = process.env.USDA_API_KEY, contact = process.env.OFF_CONTACT;
if (!key) throw new Error('USDA_API_KEY is not set (run scripts/supplement-barcode-coverage.sh)');
const DSLD = 'https://api.ods.od.nih.gov/dsld/v9';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
// A rate limit (429) or a server hiccup waits and tries again (Retry-After when sent, else 5, 15, 30 s); other failures throw to the caller, which notes them and carries on.
const json = async (url: string, headers: Record<string, string> = {}): Promise<unknown> => {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(15000) });
    if (r.status === 404) return null;
    if ((r.status === 429 || r.status >= 500) && attempt < 3) {
      const wait = Number(r.headers.get('retry-after')) || [5, 15, 30][attempt]!;
      console.error(`  (HTTP ${r.status}, waiting ${wait} s)`);
      await sleep(wait * 1000);
      continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
};

const args = process.argv.slice(2);
let upcs: string[] = [];
const file = args.indexOf('--file'), dsld = args.indexOf('--dsld');
if (file >= 0) upcs = readFileSync(args[file + 1]!, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
else if (dsld >= 0) {
  const want = Number(args[dsld + 1] ?? 10), years = [2012, 2016, 2019, 2021, 2023];
  for (const y of years) {
    const hits = ((await json(`${DSLD}/search-filter?q=*&status=1&size=${want * 2}&date_start=${y}&date_end=${y}&sort_by=entryDate`)) as { hits?: { _id: string }[] }).hits ?? [];
    for (const h of hits) {
      if (upcs.length >= want * (years.indexOf(y) + 1) / years.length) break;
      const label = (await json(`${DSLD}/label/${h._id}`)) as { upcSku?: string } | null;
      await sleep(250);
      if (label?.upcSku) upcs.push(label.upcSku);
    }
  }
} else throw new Error('pass --dsld <n> or --file <path>');

const rows: string[] = [];
let named = 0, listed = 0, n = 0;
let errored = 0;
for (const raw of upcs) {
  try {
  const gtin = cleanGtin(raw.replace(/[\s-]/g, ''));
  n++;
  if (!gtin) { rows.push(`${raw} | not a valid code`); continue; }
  let who = 'none', found: ProductName | null = null;
  const u = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  u.search = new URLSearchParams({ query: gtin, dataType: 'Branded', pageSize: '10', api_key: key }).toString();
  found = nameForGtin(await json(u.toString()), gtin); await sleep(300);
  if (found) who = 'USDA';
  else if (contact) {
    found = offName(await json(`https://world.openfoodfacts.org/api/v2/product/${gtin}.json?fields=code,product_name,brands`, { 'user-agent': `Loadbearer/1.0 (${contact})` })); await sleep(1200);
    if (found) who = 'OFF';
  }
  let listing = '';
  if (found) {
    named++;
    const q = `${found.brand ?? ''} ${found.name}`.trim().slice(0, 100);
    const r = (await json(`${DSLD}/search-filter?q=${encodeURIComponent(q)}&status=1&size=3`)) as { stats?: { count?: number }; hits?: { _source: { fullName?: string; brandName?: string } }[] } | null;
    await sleep(250);
    const top = (r?.hits ?? []).map(h => `${h._source.brandName ?? ''} ${h._source.fullName ?? ''}`.trim());
    // A listing "found" = one of the top three results holds every word of the name (the add sheet's own search needs every word).
    const words = q.toLowerCase().replace(/['’]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const ok = top.some(t => words.every(w => t.toLowerCase().includes(w)));
    if (ok) listed++;
    listing = ` | listing ${ok ? 'YES' : 'no'} | "${q}" -> ${top[0] ?? 'nothing'}`;
  }
  rows.push(`${raw} | ${who}${listing}`);
  } catch (err) { errored++; rows.push(`${raw} | could not ask: ${err instanceof Error ? err.message : 'failed'}`); }
}

console.log(rows.join('\n'));
console.log(`\n${named} of ${n} UPCs got a name${errored ? ` (${errored} could not be asked: run again later)` : ''}; ${listed} of those named a listing in the top three results.`);
console.log(errored > n / 4 ? 'INCONCLUSIVE: too many UPCs could not be asked (a rate limit or a bad key). Wait a few minutes and run again.' : named < 8 * n / 20 ? 'BELOW THE KILL LINE (under 8 in 20 named): stop and tell the owner.' : listed < 5 * n / 20 ? 'BELOW THE KILL LINE (under 5 in 20 listed): stop and tell the owner.' : 'Above the kill lines.');
