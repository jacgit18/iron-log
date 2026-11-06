import { offHit } from '../src/shared/offFood.ts';
import type { FoodHit } from '../src/shared/foods.ts';

// Open Food Facts (brief barcode-coverage): the second place a scanned code is looked up, only after USDA has no product with it. This is the one module that knows the
// vendor: its address, the User-Agent it asks every client to send (app name and version, then a contact address in brackets), and what its answers mean. No key. The
// contact address is the OFF_CONTACT setting; it is sent to Open Food Facts and never logged or answered. Nothing is stored.

export const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = 'code,product_name,brands,nutriments,serving_quantity';

export interface OffDeps {
  /** OFF_CONTACT: the address Open Food Facts may write to about this app's traffic. Unset: the lookup is off and a USDA miss is just "not found". */
  contact?: string;
  fetch?: typeof fetch;
  timeoutMs: number;
}

/** The product for a 14-digit code, or null when Open Food Facts does not know it. Throws on a timeout, a refusal or any other failure so the caller can tell "not there" from "could not ask". */
export async function askOpenFoods(gtin: string, { contact, fetch: ask = fetch, timeoutMs }: OffDeps & { contact: string }): Promise<FoodHit | null> {
  const url = new URL(`${OFF_URL}/${gtin}.json`);
  url.search = new URLSearchParams({ fields: FIELDS }).toString();
  const r = await ask(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json', 'user-agent': `Loadbearer/1.0 (${contact})` } });
  if (r.status === 404) return null; // an unknown code answers 404 or a 200 with status 0; both are "not there"
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return offHit(await r.json(), gtin);
}
