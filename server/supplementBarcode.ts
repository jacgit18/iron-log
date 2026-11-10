import { Router } from 'express';
import { dayCap } from './dayCap.ts';
import { askOpenName } from './openFoodFacts.ts';
import { DAILY_MAX, HOLD_MS, TIMEOUT_MS, USDA_URL, type FoodDeps } from './foodSearch.ts';
import { cleanGtin, nameForGtin, type ProductName } from '../src/shared/barcode.ts';

// Supplement barcode (brief supplement-barcode-search), mounted at /api/supplement-barcode behind sign-in and a per-user limit. NIH's label database cannot be searched by UPC, so the
// phone reads the code and this asks USDA FoodData Central (Branded foods), then Open Food Facts when OFF_CONTACT is set, for the product's NAME and BRAND only; the add sheet puts them
// in its search and the person picks the listing. Unlike the food route it needs no calories or protein (a vitamin has none worth the name). Same exact-code rule, same key and
// settings (`foods`), its own daily counter. Nothing is stored; the code is never logged. A miss is held an hour so a repeat scan spends nothing; if Open Food Facts could not be asked
// and USDA had nothing, the answer is "unavailable" (503) and nothing is held.

const ASK_FOR = 10;
const HOLD_MAX = 500;
const UNAVAILABLE = 'barcode lookup is not available right now';

export function supplementBarcodeRoutes({ key, offContact, fetch: ask = fetch, now = Date.now }: FoodDeps = {}): Router {
  const router = Router();
  const held = new Map<string, { at: number; found: ProductName | null }>();
  const daily = dayCap(now);

  router.get('/:gtin', async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const gtin = cleanGtin(req.params.gtin);
    if (!gtin) return void res.status(422).json({ ok: false, error: 'that is not a product barcode' });
    if (!key) return void res.status(503).json({ ok: false, error: UNAVAILABLE, why: 'no-key' });
    const allowed = daily.take(String(res.locals.userId), DAILY_MAX); // counted on every valid code, held answer or not
    if (!allowed.ok) {
      res.setHeader('Retry-After', String(allowed.retryAfterSec));
      return void res.status(429).json({ ok: false, error: 'you have used today\'s barcode lookups, try again tomorrow' });
    }
    const t = now(), old = held.get(gtin);
    const answer = (found: ProductName | null) => (found ? res.json({ ok: true, ...found }) : res.status(404).json({ ok: false, error: 'no product has that barcode', why: 'not-found' }));
    if (old && t - old.at < HOLD_MS) return void answer(old.found);
    try {
      const url = new URL(USDA_URL);
      url.search = new URLSearchParams({ query: gtin, dataType: 'Branded', pageSize: String(ASK_FOR), api_key: key }).toString();
      const r = await ask(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(`upstream ${r.status}`);
      let found = nameForGtin(await r.json(), gtin);
      let sure = true; // false when Open Food Facts could not be asked: the miss is not held and the answer is "unavailable"
      if (!found && offContact) {
        try { found = await askOpenName(gtin, { contact: offContact, fetch: ask, timeoutMs: TIMEOUT_MS }); } catch (err) {
          sure = false;
          console.warn(JSON.stringify({ msg: 'open food facts name lookup failed', reason: err instanceof Error ? err.name === 'Error' ? err.message : err.name : 'unknown' }));
        }
      }
      if (!sure) return void res.status(503).json({ ok: false, error: UNAVAILABLE, why: 'upstream' });
      if (held.size >= HOLD_MAX) held.delete(held.keys().next().value as string);
      held.set(gtin, { at: t, found });
      answer(found);
    } catch (err) {
      // Never log the URL: it carries the key and the code.
      console.warn(JSON.stringify({ msg: 'supplement barcode lookup failed', reason: err instanceof Error ? err.name === 'Error' ? err.message : err.name : 'unknown' }));
      res.status(503).json({ ok: false, error: UNAVAILABLE, why: 'upstream' });
    }
  });

  return router;
}
