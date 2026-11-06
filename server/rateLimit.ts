import { isIPv6 } from 'node:net';
import type { Request, RequestHandler, Response } from 'express';

// A fixed-window limit per client IP, in memory (phase-b-brief §3.4). Used on the sign-in routes, where an anonymous caller can
// otherwise start as many Google round trips and session lookups as they like. The IP is Express's req.ip, which behind Cloud Run
// is the address the proxy saw (see `trust proxy`). Each Cloud Run instance counts for itself, so the real ceiling is the limit
// times the instance count: enough to stop a script, not a precise quota. A limited call gets 429 and a Retry-After in seconds.
export interface Limit {
  max: number;
  windowMs: number;
}

interface Window {
  start: number;
  count: number;
}

/** The most keys one limiter tracks. Past it, callers not yet tracked share one overflow bucket (see `rateLimit`). */
export const MAX_KEYS = 50_000;
const OVERFLOW_KEY = 'overflow:';

/** The 8 sixteen-bit groups of an IPv6 address, or null when it does not parse. A zone id (`%eth0`) is ignored and a dotted IPv4 tail (`::ffff:1.2.3.4`) is read as two groups. */
function ipv6Groups(ip: string): number[] | null {
  let a = ip.split('%')[0]!;
  const dotted = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
  if (dotted) {
    const [, head, ...o] = dotted;
    const n = o.map(Number);
    if (n.some(x => x > 255)) return null;
    a = `${head}${((n[0]! << 8) | n[1]!).toString(16)}:${((n[2]! << 8) | n[3]!).toString(16)}`;
  }
  const halves = a.split('::');
  if (halves.length > 2) return null;
  const part = (h: string): string[] => (h === '' ? [] : h.split(':'));
  const head = part(halves[0]!);
  const tail = halves.length === 2 ? part(halves[1]!) : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 2 ? fill < 1 : fill !== 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? fill : 0).fill('0'), ...tail].map(g => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : NaN));
  return groups.length === 8 && groups.every(g => !Number.isNaN(g)) ? groups : null;
}

/**
 * The key for a client address. IPv4 is used as is. IPv6 is keyed by its /64, the smallest block an ISP hands one subscriber, because one
 * person can rotate through the whole /64 and would otherwise get a fresh allowance per address. An IPv4-mapped address (`::ffff:a.b.c.d`)
 * is an IPv4 client, so it keeps its own key; grouping it by /64 would put every IPv4 client in one bucket. Anything unparseable is used as is.
 */
export function ipKey(ip: string): string {
  if (!isIPv6(ip)) return ip;
  const g = ipv6Groups(ip);
  if (!g) return ip;
  if (g.slice(0, 5).every(x => x === 0) && g[5] === 0xffff) return ip;
  return `${g.slice(0, 4).map(x => x.toString(16)).join(':')}::/64`;
}

/** Who a call counts against. The client address by default (IPv6 by /64); after sign-in, a user id keeps one noisy phone from using a whole shared network's allowance. */
export const byIp = (req: Request): string => ipKey(req.ip ?? 'unknown');
export const byUser = (_req: Request, res: Response): string => `user:${String(res.locals.userId)}`;

export function rateLimit({ max, windowMs }: Limit, now: () => number = Date.now, key: (req: Request, res: Response) => string = byIp): RequestHandler {
  const windows = new Map<string, Window>();
  let swept = 0;
  return (req, res, next) => {
    const t = now();
    // Expired windows are dropped as they are met, and the map is swept when it grows, so it cannot fill with one-off addresses. The sweep walks every key, so it
    // runs at most once a second (as the sign-in limiter's does); otherwise each request past 10,000 live keys would cost O(n) (audit S-6).
    if (windows.size > 10_000 && t - swept >= 1000) { swept = t; for (const [k, w] of windows) if (t - w.start >= windowMs) windows.delete(k); }
    let who = key(req, res);
    // Bounded memory without a bypass: at the cap (after the sweep above), a key not yet tracked joins one shared overflow bucket with the same
    // limit. Evicting the oldest key instead would let a flood of fresh addresses wipe an abuser's own counter. Tracked callers keep their counts.
    if (windows.size >= MAX_KEYS && !windows.has(who)) who = OVERFLOW_KEY;
    let w = windows.get(who);
    if (!w || t - w.start >= windowMs) {
      w = { start: t, count: 0 };
      windows.set(who, w);
    }
    if (++w.count > max) {
      // One line when a caller first goes over (not one per refused call), so a flood shows up in the logs without filling them.
      if (w.count === max + 1) console.warn(JSON.stringify({ msg: 'rate limited', path: req.baseUrl + req.path, who: who.startsWith('user:') ? 'user' : who === OVERFLOW_KEY ? 'overflow' : 'ip', max, windowMs }));
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((w.start + windowMs - t) / 1000))));
      res.status(429).json({ ok: false, error: 'too many attempts, try again shortly' });
      return;
    }
    next();
  };
}
