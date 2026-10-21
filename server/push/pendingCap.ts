// A per-account cap on scheduled pushes still waiting to fire (audit 2026-10-21, S-5). Each /schedule call that succeeds queues a Cloud Task, a billed
// per-use resource, and a task stays queued until its time even when a newer schedule replaces its marker. The route's rate limit alone allowed about 60 a minute,
// so one account could queue ~10,800 over the 3-hour horizon (MAX_AHEAD_MS). Normal use is a handful (a rest timer and a day nudge per device).
//
// OWNER DECISION: MAX_PENDING_TASKS = 200 per account. Raise or lower here; it is generous (10 devices x 2 kinds is 20 at a time).
// The count lives in memory per server instance, like the rate limiter, so with N Cloud Run instances the ceiling is N x 200: a bound on cost, not an exact quota,
// and a restart forgets it. An exact count would need a table (a migration), which this does not justify.
export const MAX_PENDING_TASKS = 200;

export interface PendingCap {
  /** True and the task is counted, or false when the account already has MAX_PENDING_TASKS waiting. */
  tryReserve(userId: string, at: number, now: number): boolean;
  /** Takes back a reservation when the scheduler failed, so a failed call does not use up the allowance. */
  release(userId: string, at: number): void;
}

export function pendingCap(max = MAX_PENDING_TASKS): PendingCap {
  const byUser = new Map<string, number[]>(); // fire times (ms) not yet reached
  return {
    tryReserve(userId, at, now) {
      const waiting = (byUser.get(userId) ?? []).filter(t => t > now);
      if (waiting.length >= max) { byUser.set(userId, waiting); return false; }
      waiting.push(at);
      byUser.set(userId, waiting);
      // Accounts with nothing waiting are dropped when the map gets large, so it cannot grow with every account ever seen.
      if (byUser.size > 10_000) for (const [k, v] of byUser) if (v.every(t => t <= now)) byUser.delete(k);
      return true;
    },
    release(userId, at) {
      const list = byUser.get(userId);
      const i = list?.indexOf(at) ?? -1;
      if (list && i >= 0) list.splice(i, 1);
    },
  };
}
