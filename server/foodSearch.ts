import { Router } from 'express';
import { cleanQuery, MAX_RESULTS, parseFoods, type FoodHit } from '../src/shared/foods.ts';

// Food search (brief diet-food-lookup), mounted at /api/foods behind sign-in and a per-user limit. The server asks USDA FoodData Central so the
// API key never reaches a phone, and answers with the few numbers a diet entry needs (src/shared/foods.ts). Nothing is stored: the answers are
// held in this instance's memory for an hour so a repeat does not spend the shared key's allowance (about 1,000 calls an hour per address).

const USDA_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const DATA_TYPES = 'Foundation,SR Legacy,Branded';
const ASK_FOR = 25; // asked for more than shown: some foods have no calories or protein and are dropped
const TIMEOUT_MS = 5000;
const HOLD_MS = 60 * 60_000;
const HOLD_MAX = 500;
export const DAILY_MAX = 200;
const DAY_MS = 24 * 60 * 60_000;

export interface FoodDeps {
  /** USDA_API_KEY. Unset: every search answers 503 and the app says the search is not available. */
  key?: string;
  fetch?: typeof fetch;
  now?: () => number;
}

const UNAVAILABLE = 'food search is not available right now';

export function foodRoutes({ key, fetch: ask = fetch, now = Date.now }: FoodDeps = {}): Router {
  const router = Router();
  const held = new Map<string, { at: number; hits: FoodHit[] }>();
  const days = new Map<string, { start: number; count: number }>();
  let saidNoKey = false;

  router.get('/search', async (req, res) => {
    const q = cleanQuery(req.query.q);
    if (!q) return void res.status(422).json({ ok: false, error: 'q is 2 to 60 characters' });
    if (!key) {
      // Said once per instance, so a missing USDA_API_KEY shows in the logs without a line per keystroke. `why` lets a browser tell this from a USDA failure.
      if (!saidNoKey) { saidNoKey = true; console.warn(JSON.stringify({ msg: 'food search is off: USDA_API_KEY is not set' })); }
      return void res.status(503).json({ ok: false, error: UNAVAILABLE, why: 'no-key' });
    }
    const t = now();
    // A daily allowance per person, so one account cannot use up the shared key. Counted on every valid search, held answer or not.
    const who = String(res.locals.userId);
    let day = days.get(who);
    if (!day || t - day.start >= DAY_MS) { day = { start: t, count: 0 }; days.set(who, day); }
    if (++day.count > DAILY_MAX) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((day.start + DAY_MS - t) / 1000))));
      return void res.status(429).json({ ok: false, error: 'you have used today\'s food searches, try again tomorrow' });
    }
    const name = q.toLowerCase();
    const old = held.get(name);
    if (old && t - old.at < HOLD_MS) return void res.json({ ok: true, hits: old.hits });
    const url = new URL(USDA_URL);
    url.search = new URLSearchParams({ query: q, dataType: DATA_TYPES, pageSize: String(ASK_FOR), api_key: key }).toString();
    try {
      const r = await ask(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(`upstream ${r.status}`);
      const hits = parseFoods(await r.json()).slice(0, MAX_RESULTS);
      // Oldest first out when full, so the map cannot grow without bound.
      if (held.size >= HOLD_MAX) held.delete(held.keys().next().value as string);
      held.set(name, { at: t, hits });
      res.json({ ok: true, hits });
    } catch (err) {
      // Never log the URL: it carries the key. The status or error name is enough.
      console.warn(JSON.stringify({ msg: 'food search failed', reason: err instanceof Error ? err.name === 'Error' ? err.message : err.name : 'unknown' }));
      res.status(503).json({ ok: false, error: UNAVAILABLE, why: 'upstream' });
    }
  });

  return router;
}
