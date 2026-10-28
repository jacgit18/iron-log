import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// android/twa-manifest.json is the Bubblewrap config for the Play build. It must say what the web manifest says, and it must not turn on billing.
const twa = JSON.parse(readFileSync(new URL('../android/twa-manifest.json', import.meta.url), 'utf8'));
const vite = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
const manifestBlock = vite.slice(vite.indexOf('manifest: {'));
const field = name => manifestBlock.match(new RegExp(`${name}: '([^']+)'`))?.[1];

describe('android/twa-manifest.json', () => {
  it('matches the web manifest', () => {
    expect(twa.name).toBe(field('name'));
    expect(twa.themeColor).toBe(field('theme_color'));
    expect(twa.backgroundColor).toBe(field('background_color'));
    expect(twa.display).toBe(field('display'));
    expect(twa.startUrl).toBe('/');
  });
  it('points at the production host and icons the site serves', () => {
    expect(twa.host).toBe('loadbearer.app');
    for (const url of [twa.iconUrl, twa.maskableIconUrl]) expect(url).toMatch(/^https:\/\/loadbearer\.app\/icons\/[\w-]+\.png$/);
  });
  it('keeps the settings the first Play build needed', () => {
    expect(twa.minSdkVersion).toBeGreaterThanOrEqual(24); // androidbrowserhelper 2.7.4 needs API 24; Bubblewrap's default 21 fails the build
    expect(twa.appVersionCode).toBeGreaterThanOrEqual(1);
    expect(twa.signingKey.path).toBe('./android.keystore'); // relative, never a path on one machine
  });
  it('sells nothing: no Play Billing feature', () => {
    expect(twa.features?.playBilling).toBeUndefined();
  });
  it('uses the chosen package name and never the placeholder (change with the name, only before the first Play upload)', () => {
    expect(twa.packageId).toBe('app.loadbearer');
    expect(twa.packageId).not.toMatch(/^com\.example\./);
  });
});
