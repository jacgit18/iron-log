import type { RequestHandler } from 'express';

// Once the app signs in on a custom domain (BASE_URL, ADR 073), the Cloud Run address still answers but sign-in fails on it
// (state_mismatch). A person who opens the old address in a browser is sent to the new one instead of seeing that error.
//
// Narrow on purpose, so nothing that checks the service breaks:
//  - only a top-level browser navigation (Sec-Fetch-Mode: navigate), so curl, the deploy smoke checks and Cloud Tasks are never redirected;
//  - only GET and HEAD, so no write is ever turned into a redirect;
//  - never /api, so health checks and the sign-in routes answer as before;
//  - only the service's own *.run.app address, not a tagged candidate address (tag---service-…), which the deploy checks directly;
//  - a temporary redirect (307), so a browser does not cache it past a rollback of BASE_URL.
const NAVIGATE_METHODS = new Set(['GET', 'HEAD']);

/** Where to send this request, or null to answer it here. `canonicalOrigin` is BASE_URL (an origin, no path). */
export function canonicalRedirect(canonicalOrigin: string | undefined, req: { method: string; host: string | undefined; fetchMode: string | undefined; url: string }): string | null {
  if (!canonicalOrigin || !NAVIGATE_METHODS.has(req.method) || req.fetchMode !== 'navigate') return null;
  const host = req.host?.toLowerCase();
  if (!host || !host.endsWith('.run.app') || host.includes('---')) return null;
  const canonical = new URL(canonicalOrigin);
  if (host === canonical.host.toLowerCase()) return null;
  if (req.url === '/api' || req.url.startsWith('/api/') || req.url.startsWith('/api?')) return null;
  return `${canonical.origin}${req.url}`;
}

export function canonicalHost(canonicalOrigin: string | undefined): RequestHandler {
  return (req, res, next) => {
    const to = canonicalRedirect(canonicalOrigin, { method: req.method, host: req.get('host'), fetchMode: req.get('sec-fetch-mode'), url: req.originalUrl });
    if (to === null) return next();
    res.redirect(307, to);
  };
}
