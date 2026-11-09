/* The day a test account's seed counts as today (QA picker reset). The seed used the server's UTC date, but the app reads the browser's local
   date, so in the evening of a US time zone the seed's "today" was already tomorrow for the person: today's log came out empty and yesterday held
   the full day. The browser now says its local date; the server trusts it only when it is a real date within one day of its own UTC date. */

const DAY_MS = 86_400_000;

/** `now` unless `claimed` is a real YYYY-MM-DD within a day of `now`'s UTC date; then noon UTC of that date. */
export function seedToday(now: Date, claimed: unknown): Date {
  if (typeof claimed !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(claimed)) return now;
  const noon = new Date(`${claimed}T12:00:00Z`);
  if (Number.isNaN(noon.getTime()) || noon.toISOString().slice(0, 10) !== claimed) return now;
  const utcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.abs(noon.getTime() - DAY_MS / 2 - utcDay) <= DAY_MS ? noon : now;
}
