/* ---------- How long to wait before trying again ----------
   Starts at the queue's old 1.5 s and doubles to a minute, with jitter so a phone and a laptop that both lost the
   network do not retry in step. A server that says how long to wait (Retry-After) is obeyed. Only pauses use this: a
   write is never dropped for failing too often (FM-02). */

export const BASE_MS = 1500;
export const MAX_MS = 60_000;

/** Wait for attempt number `attempt` (0 is the first failure). `random` is injectable for tests; it returns [0, 1). */
export function backoffMs(attempt: number, retryAfterMs: number | null = null, random: () => number = Math.random): number {
  if (retryAfterMs !== null) return Math.max(retryAfterMs, 0);
  const wait = Math.min(BASE_MS * 2 ** Math.max(attempt, 0), MAX_MS);
  return Math.round(wait * (0.8 + random() * 0.4)); // 80% to 120%
}
