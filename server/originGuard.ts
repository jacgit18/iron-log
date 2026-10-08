import type { RequestHandler } from 'express';

// The CSRF layer for cookie sign-in (phase-b-brief §3.4). SameSite=Lax cookies and the x-client-version header (which forces a
// CORS preflight the API never grants) come first; this refuses what is left: a state-changing request whose Origin header is
// present and is neither this server's own host nor a configured origin. A request with no Origin (curl, a server, a same-origin
// GET) is not a browser cross-site request and passes; the cookie rules still apply to it.
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function originGuard(allowed: readonly string[] = []): RequestHandler {
  const origins = new Set(allowed.map(o => new URL(o).origin));
  return (req, res, next) => {
    const origin = req.get('origin');
    if (SAFE.has(req.method) || origin === undefined) return next();
    let ok = origins.has(origin);
    if (!ok) {
      try {
        ok = new URL(origin).host === req.get('host');
      } catch {
        ok = false; // "null" (a sandboxed or redirected request) or garbage
      }
    }
    if (ok) return next();
    res.status(403).json({ ok: false, error: 'cross-origin request refused' });
  };
}
