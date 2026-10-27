import type { Request, Response } from 'express';

// Digital Asset Links for the Android app (a Trusted Web Activity around this site, ADR 078). Chrome fetches /.well-known/assetlinks.json
// to check that the installed app and this site belong together; without it the app opens as a Custom Tab with an address bar.
// The package name is permanent once published and the fingerprint is Play App Signing's key (copy it from Play Console after the first
// upload), so both come from the environment, read on every request: set them on Cloud Run and no deploy is needed. Unset or malformed
// means 404, never an empty file, so a half-set value cannot publish a wrong link.
// Sources: https://developers.google.com/digital-asset-links/v1/getting-started (the statement shape) and
// https://developer.chrome.com/docs/android/trusted-web-activity/quick-start (the file path and its purpose).

const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/; // Android application id: two or more dot-separated segments
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/; // SHA-256 as 32 colon-separated hex bytes

export type AssetLinksEnv = { ANDROID_PACKAGE_NAME?: string; ANDROID_SHA256_CERT_FINGERPRINTS?: string };

/** The statement list, or null when the environment is unset or any value is malformed. Fingerprints are comma-separated, upper-cased, de-duplicated. */
export function buildAssetLinks(env: AssetLinksEnv): object[] | null {
  const pkg = env.ANDROID_PACKAGE_NAME?.trim();
  const raw = env.ANDROID_SHA256_CERT_FINGERPRINTS?.trim();
  if (!pkg || !raw || !PACKAGE.test(pkg)) return null;
  const prints = raw.split(',').map(f => f.trim().toUpperCase());
  if (!prints.every(f => FINGERPRINT.test(f))) return null;
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: [...new Set(prints)] },
  }];
}

export function assetLinksRoute(env: () => AssetLinksEnv = () => process.env) {
  return (_req: Request, res: Response) => {
    const body = buildAssetLinks(env());
    if (!body) { res.status(404).json({ ok: false, error: 'not found' }); return; }
    res.set('Cache-Control', 'public, max-age=300').type('application/json').send(JSON.stringify(body));
  };
}
