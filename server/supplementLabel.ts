import { Router } from 'express';
import { dayCap } from './dayCap.ts';
import { mapDsldLabel, type SupplementLabel } from '../src/shared/dsldLabel.ts';

// One supplement's label (brief supplement-label-amounts, ADR 029 amendment), mounted at /api/supplement-label behind sign-in and a per-user limit. The catalog is imported slim (no
// amounts), so the amounts are read on demand from the NIH Dietary Supplement Label Database (DSLD): no key, and this is the one module that knows its address. The answer is the mapped
// label (src/shared/dsldLabel.ts), never the raw record. Nothing is stored: answers are held in this instance's memory for an hour, so a repeat does not ask NIH again.

export const DSLD_URL = 'https://api.ods.od.nih.gov/dsld/v9/label';
export const TIMEOUT_MS = 5000;
export const HOLD_MS = 60 * 60_000;
const HOLD_MAX = 500;
export const DAILY_MAX = 150;
const CATALOG_ID = /^c:dsld:(\d{1,9})$/;

export interface SupplementLabelDeps { fetch?: typeof fetch; now?: () => number }

/** The label of one DSLD product, null when NIH has none (404, or a record with no ingredient rows). Throws on a timeout, a refusal or a body that is not a label record. */
export async function askDsld(dsldId: number, { fetch: ask = fetch, timeoutMs = TIMEOUT_MS }: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<SupplementLabel | null> {
  if (!Number.isSafeInteger(dsldId) || dsldId < 0) throw new Error('bad id'); // only a whole number reaches the address
  const r = await ask(`${DSLD_URL}/${String(dsldId)}`, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  const body: unknown = await r.json(); // junk throws here: "could not ask", not "not there"
  if (!body || typeof body !== 'object') throw new Error('upstream body');
  return mapDsldLabel(body);
}

export function supplementLabelRoutes({ fetch: ask = fetch, now = Date.now }: SupplementLabelDeps = {}): Router {
  const router = Router();
  const held = new Map<string, { at: number; label: SupplementLabel }>();
  const daily = dayCap(now);

  router.get('/:id', async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const id = String(req.params.id), m = CATALOG_ID.exec(id);
    if (!m) return void res.status(422).json({ ok: false, error: 'id is c:dsld: and digits' });
    const allowed = daily.take(String(res.locals.userId), DAILY_MAX); // counted on every valid ask, held answer or not
    if (!allowed.ok) {
      res.setHeader('Retry-After', String(allowed.retryAfterSec));
      return void res.status(429).json({ ok: false, error: 'you have used today\'s label lookups, try again tomorrow' });
    }
    const t = now(), old = held.get(id);
    if (old && t - old.at < HOLD_MS) return void res.json({ ok: true, label: old.label });
    try {
      const label = await askDsld(Number(m[1]), { fetch: ask });
      if (!label) return void res.status(404).json({ ok: false, error: 'no label found for this product', why: 'not-found' });
      if (held.size >= HOLD_MAX) held.delete(held.keys().next().value as string); // oldest first out
      held.set(id, { at: t, label });
      res.json({ ok: true, label });
    } catch (err) {
      console.warn(JSON.stringify({ msg: 'supplement label failed', reason: err instanceof Error ? err.name === 'Error' ? err.message : err.name : 'unknown' }));
      res.status(503).json({ ok: false, error: 'the label database is not available right now', why: 'upstream' });
    }
  });

  return router;
}
