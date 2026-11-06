// A rolling 24-hour allowance per key, kept in this instance's memory (food search: per person; label scan: one key for the whole server).
// An instance restart or a second instance starts a count at 0, so this bounds a burst, not the day: a feature with a per-use cost also needs a
// spend limit at the provider.
const DAY_MS = 24 * 60 * 60_000;

export function dayCap(now: () => number = Date.now) {
  const days = new Map<string, { start: number; count: number }>();
  return {
    /** Uses still free for `key` in the current day (all `max` when it has none yet). Counts nothing. */
    left(key: string, max: number): number {
      const day = days.get(key);
      return !day || now() - day.start >= DAY_MS ? max : Math.max(0, max - day.count);
    },
    /** Counts one use for `key`. Past `max` in the current day it counts nothing and says how many seconds until the day ends. */
    take(key: string, max: number): { ok: true } | { ok: false; retryAfterSec: number } {
      const t = now();
      let day = days.get(key);
      if (!day || t - day.start >= DAY_MS) { day = { start: t, count: 0 }; days.set(key, day); }
      if (day.count >= max) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((day.start + DAY_MS - t) / 1000)) };
      day.count++;
      return { ok: true };
    },
  };
}
