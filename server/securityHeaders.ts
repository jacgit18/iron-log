import type { RequestHandler } from 'express';

// Headers on every response (phase-b-brief §3.4). The policy is what the built app needs and nothing more: its own scripts,
// styles (React sets inline style attributes), images and fonts, plus the one outside host it calls (GitHub, for the update check).
// Anything else, including an injected inline script, is refused by the browser.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.github.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function securityHeaders(): RequestHandler {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    // Only over https (req.secure needs `trust proxy` behind Cloud Run); sent over http it would be ignored anyway.
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // The development sign-in check page (never served in production) has an inline script.
    if (!req.path.startsWith('/dev/')) res.setHeader('Content-Security-Policy', CSP);
    next();
  };
}
