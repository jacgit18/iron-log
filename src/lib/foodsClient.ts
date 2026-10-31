import { signIn } from '../sync/devUser.js';
import { cleanHits, type FoodHit } from '../shared/foods.js';

// Food search: the app's call to /api/foods/search (brief diet-food-lookup). Nothing is stored; every failure comes back as a plain reason, never a throw.
export type FoodsFailure = { ok: false; reason: 'offline' | 'limit' | 'unavailable' };

export async function searchFoods(q: string, signal?: AbortSignal): Promise<{ ok: true; hits: FoodHit[] } | FoodsFailure> {
  let res: Response;
  try {
    res = await fetch(`/api/foods/search?q=${encodeURIComponent(q)}`, { headers: { 'x-client-version': __APP_VERSION__, ...signIn() }, ...(signal ? { signal } : {}) });
  } catch { return { ok: false, reason: 'offline' }; }
  if (res.status === 429) return { ok: false, reason: 'limit' };
  if (!res.ok) return fail(res.status, await why(res));
  try { return { ok: true, hits: cleanHits(await res.json()) }; } catch { return fail(res.status, 'unreadable'); }
}

// Every non-ok answer shows as the same words under the box, so the real status (and the server's `why`) goes to the console: that is what tells a missing key (503 no-key) from a route that is not mounted (404) or a page served instead of JSON.
const fail = (status: number, why: string): FoodsFailure => {
  console.warn(`food search unavailable: status ${status}, ${why}`);
  return { ok: false, reason: 'unavailable' };
};
const why = async (res: Response) => { try { const b = (await res.json()) as { why?: unknown }; return typeof b.why === 'string' ? b.why : 'no reason given'; } catch { return 'unreadable'; } };

/** The words under the box for each way a search can fail. */
export const FOODS_FAILURE_TEXT: Record<FoodsFailure['reason'], string> = {
  offline: 'You are offline. You can still type the numbers.',
  limit: 'You have used today’s food searches. You can still type the numbers.',
  unavailable: 'Food search is not available right now. You can still type the numbers.',
};
