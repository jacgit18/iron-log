import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RequestHandler } from 'express';

// Headers on every response (phase-b-brief §3.4). The policy is what the built app needs and nothing more: its own scripts,
// styles, images and fonts, plus the one outside host it calls (GitHub, for the update check).
// Anything else, including an injected inline script or an injected <style> element, is refused by the browser.

/** The `'sha256-...'` sources for every inline <style> element in the built pages (index.html, privacy.html, ...), so those, and nothing injected later, may style the page. */
export function inlineStyleHashes(staticDir: string | undefined): string[] {
  if (!staticDir || !existsSync(staticDir)) return [];
  const hashes = new Set<string>();
  for (const file of readdirSync(staticDir).filter(f => f.endsWith('.html'))) {
    for (const m of readFileSync(join(staticDir, file), 'utf8').matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)) hashes.add(`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  }
  return [...hashes].sort();
}

export function contentSecurityPolicy(styleHashes: readonly string[] = []): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    // Elements: the app's own stylesheets and the hashed inline blocks above. Attributes: React sets style="..." from run-time values, which a hash cannot cover.
    `style-src 'self' ${styleHashes.join(' ')}`.trim(),
    "style-src-attr 'unsafe-inline'",
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
}

export function securityHeaders(staticDir?: string): RequestHandler {
  const CSP = contentSecurityPolicy(inlineStyleHashes(staticDir));
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // The barcode scanner opens the camera on this origin (BarcodeSheet.tsx); nothing else may use it, and no embedded page gets it.
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    // Other sites cannot load this origin's files as images, scripts or fonts. (No Cross-Origin-Embedder-Policy: the app never needs cross-origin isolation, and it would make every outside load opt in.)
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    // Only over https (req.secure needs `trust proxy` behind Cloud Run); sent over http it would be ignored anyway.
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // The development sign-in check page (never served in production) has an inline script.
    if (!req.path.startsWith('/dev/')) res.setHeader('Content-Security-Policy', CSP);
    next();
  };
}
