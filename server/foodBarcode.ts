import { Router } from 'express';
import { dayCap } from './dayCap.ts';
import { askOpenFoods } from './openFoodFacts.ts';
import { DAILY_MAX, HOLD_MS, TIMEOUT_MS, USDA_URL, type FoodDeps } from './foodSearch.ts';
import { cleanGtin, hitForGtin } from '../src/shared/barcode.ts';
import type { FoodHit } from '../src/shared/foods.ts';

// Barcode lookup (brief barcode-scan), mounted at /api/foods/barcode behind sign-in, the admin check and a per-user limit. The phone reads the code; the server asks
// USDA FoodData Central for Branded foods with that code and answers with the one product whose own code is exactly the scanned one (src/shared/barcode.ts), in the
// same shape a typed search gives. Nothing is stored. The code is never logged: a failure line names only the status or error. Answers (including "not found") are
// held in this instance's memory for an hour so a repeat scan does not spend the shared key's allowance. When USDA has no such product and OFF_CONTACT is set, Open
// Food Facts is asked next (brief barcode-coverage, server/openFoodFacts.ts); its answer has source 'off'. If it cannot be asked (timeout, 429, 5xx) and USDA had nothing, the scan answers
// "unavailable" (503, try again) rather than "not found", and nothing is held, so the next scan asks again.

const ASK_FOR = 10; // a code normally has one product; a few spare in case USDA returns near matches first
const HOLD_MAX = 500;
const UNAVAILABLE = 'food search is not available right now';

export function barcodeRoutes({ key, offContact, fetch: ask = fetch, now = Date.now }: FoodDeps = {}) {
  const router = Router();
  const held = new Map<string, { at: number; hit: FoodHit | null }>();
  const daily = dayCap(now);

  router.get('/:gtin', async (req, res) => {
    const gtin = cleanGtin(req.params.gtin);
    if (!gtin) return void res.status(422).json({ ok: false, error: 'that is not a product barcode' });
    if (!key) return void res.status(503).json({ ok: false, error: UNAVAILABLE, why: 'no-key' });
    // The same daily number as typed search (DAILY_MAX) but its own counter, kept per person; counted on every valid code, held answer or not. An admin can use both budgets against the shared USDA key.
    const allowed = daily.take(String(res.locals.userId), DAILY_MAX);
    if (!allowed.ok) {
      res.setHeader('Retry-After', String(allowed.retryAfterSec));
      return void res.status(429).json({ ok: false, error: 'you have used today\'s food searches, try again tomorrow' });
    }
    const t = now();
    const old = held.get(gtin);
    const answer = (hit: FoodHit | null) => (hit ? res.json({ ok: true, hit }) : res.status(404).json({ ok: false, error: 'no product has that barcode', why: 'not-found' }));
    if (old && t - old.at < HOLD_MS) return void answer(old.hit);
    try {
      const url = new URL(USDA_URL);
      // USDA stores the code as 14 digits and finds it by searching for those digits (checked against the live service); the exact match is made here, not by USDA.
      url.search = new URLSearchParams({ query: gtin, dataType: 'Branded', pageSize: String(ASK_FOR), api_key: key }).toString();
      const r = await ask(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(`upstream ${r.status}`);
      let hit = hitForGtin(await r.json(), gtin);
      let sure = true; // false when Open Food Facts could not be asked: the miss is not held and the answer is "unavailable"
      if (!hit && offContact) {
        try { hit = await askOpenFoods(gtin, { contact: offContact, fetch: ask, timeoutMs: TIMEOUT_MS }); } catch (err) {
          sure = false;
          console.warn(JSON.stringify({ msg: 'open food facts lookup failed', reason: err instanceof Error ? err.name === 'Error' ? err.message : err.name : 'unknown' }));
        }
      }
      if (!sure) return void res.status(503).json({ ok: false, error: UNAVAILABLE, why: 'upstream' });
      if (held.size >= HOLD_MAX) held.delete(held.keys().next().value as string);
      held.set(gtin, { at: t, hit });
      answer(hit);
    } catch (err) {
      // Never log the URL: it carries the key and the code.
      console.warn(JSON.stringify({ msg: 'barcode lookup failed', reason: err instanceof Error ? err.name === 'Error' ? err.message : err.name : 'unknown' }));
      res.status(503).json({ ok: false, error: UNAVAILABLE, why: 'upstream' });
    }
  });

  return router;
}
