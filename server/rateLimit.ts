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

/** Who a call counts against. The client address by default; after sign-in, a user id keeps one noisy phone from using a whole shared network's allowance. */
export const byIp = (req: Request): string => req.ip ?? 'unknown';
export const byUser = (_req: Request, res: Response): string => `user:${String(res.locals.userId)}`;

export function rateLimit({ max, windowMs }: Limit, now: () => number = Date.now, key: (req: Request, res: Response) => string = byIp): RequestHandler {
  const windows = new Map<string, Window>();
  let swept = 0;
  return (req, res, next) => {
    const t = now();
    // Expired windows are dropped as they are met, and the map is swept when it grows, so it cannot fill with one-off addresses. The sweep walks every key, so it
    // runs at most once a second (as the sign-in limiter's does); otherwise each request past 10,000 live keys would cost O(n) (audit S-6).
    if (windows.size > 10_000 && t - swept >= 1000) { swept = t; for (const [k, w] of windows) if (t - w.start >= windowMs) windows.delete(k); }
    const who = key(req, res);
    let w = windows.get(who);
    if (!w || t - w.start >= windowMs) {
      w = { start: t, count: 0 };
      windows.set(who, w);
    }
    if (++w.count > max) {
      // One line when a caller first goes over (not one per refused call), so a flood shows up in the logs without filling them.
      if (w.count === max + 1) console.warn(JSON.stringify({ msg: 'rate limited', path: req.baseUrl + req.path, who: who.startsWith('user:') ? 'user' : 'ip', max, windowMs }));
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((w.start + windowMs - t) / 1000))));
      res.status(429).json({ ok: false, error: 'too many attempts, try again shortly' });
      return;
    }
    next();
  };
}
