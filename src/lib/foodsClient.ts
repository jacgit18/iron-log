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
  if (!res.ok) return { ok: false, reason: 'unavailable' };
  try { return { ok: true, hits: cleanHits(await res.json()) }; } catch { return { ok: false, reason: 'unavailable' }; }
}

/** The words under the box for each way a search can fail. */
export const FOODS_FAILURE_TEXT: Record<FoodsFailure['reason'], string> = {
  offline: 'You are offline. You can still type the numbers.',
  limit: 'You have used today’s food searches. You can still type the numbers.',
  unavailable: 'Food search is not available right now. You can still type the numbers.',
};
