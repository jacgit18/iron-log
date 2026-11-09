import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

// scripts/play-release.sh with Bubblewrap and gcloud replaced by stubs: no build, no network, no real key.
const SCRIPT = resolve('scripts/play-release.sh');
const PASSWORD = 'hunter2-not-real';

const MANIFEST = `{
  "packageId": "app.loadbearer",
  "navigationColor": "#1E2326",
  "appVersionName": "2",
  "appVersionCode": 2,
  "minSdkVersion": 24,
  "appVersion": "2"
}`;

let dir, android, log;
const stub = (name, body) => { const p = join(dir, name); writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`); chmodSync(p, 0o755); return p; };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'play-release-'));
  android = join(dir, 'android');
  log = join(dir, 'log');
  mkdirSync(join(android, 'app'), { recursive: true });
  writeFileSync(join(android, 'twa-manifest.json'), MANIFEST);
  writeFileSync(join(android, 'android.keystore'), 'not a keystore');
});

const run = (args, { bubblewrap = 'ok', gcloud = `printf '%s' ${PASSWORD}`, env = {} } = {}) => {
  const bw = stub('bubblewrap', bubblewrap === 'ok'
    ? `echo "$1 pw=\${BUBBLEWRAP_KEYSTORE_PASSWORD} key=\${BUBBLEWRAP_KEY_PASSWORD}" >> "${log}"
if [ "$1" = update ]; then code=$(grep -oE '"appVersionCode": *[0-9]+' twa-manifest.json | grep -oE '[0-9]+$'); echo "versionCode $code" > app/build.gradle; fi
if [ "$1" = build ]; then : > app-release-bundle.aab; : > app-release-signed.apk; fi`
    : 'echo "boom" >&2; exit 1');
  const gc = stub('gcloud', gcloud);
  return spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ANDROID_DIR: android, BUBBLEWRAP: bw, GCLOUD: gc, ...env },
  });
};
const manifest = () => readFileSync(join(android, 'twa-manifest.json'), 'utf8');

describe('play-release.sh build', () => {
  it('raises the version in all three fields, builds with the stored password, and never prints it', () => {
    const r = run(['build']);
    expect(r.status, r.stderr).toBe(0);
    expect(manifest()).toContain('"appVersionCode": 3');
    expect(manifest()).toContain('"appVersionName": "3"');
    expect(manifest()).toContain('"appVersion": "3"');
    const calls = readFileSync(log, 'utf8');
    expect(calls).toContain(`build pw=${PASSWORD} key=${PASSWORD}`);
    expect(r.stdout + r.stderr).not.toContain(PASSWORD);
    expect(r.stdout).toContain('Version code 2 -> 3');
  });

  it('--code sets an exact version code', () => {
    const r = run(['build', '--code', '9']);
    expect(r.status, r.stderr).toBe(0);
    expect(manifest()).toContain('"appVersionCode": 9');
  });

  it('puts the manifest back when the build fails', () => {
    const r = run(['build'], { bubblewrap: 'fail' });
    expect(r.status).not.toBe(0);
    expect(manifest()).toBe(MANIFEST);
  });

  it('prefers BUBBLEWRAP_KEYSTORE_PASSWORD from the shell over Secret Manager', () => {
    const r = run(['build'], { gcloud: 'echo "gcloud must not be called" >&2; exit 9', env: { BUBBLEWRAP_KEYSTORE_PASSWORD: 'from-shell' } });
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(log, 'utf8')).toContain('build pw=from-shell key=from-shell');
  });

  it('warns when Bubblewrap rewrites other manifest lines', () => {
    const rewriting = stub('rewriting-bubblewrap', `sed -i 's/#1E2326/#000000/' twa-manifest.json
if [ "$1" = update ]; then echo "versionCode 3" > app/build.gradle; fi
if [ "$1" = build ]; then : > app-release-bundle.aab; : > app-release-signed.apk; fi`);
    const r = run(['build'], { env: { BUBBLEWRAP: rewriting } });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain('also changed these lines');
  });
});

describe('play-release.sh check', () => {
  it('reports the length of the stored password, not the password', () => {
    const r = run(['check']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`${PASSWORD.length} characters`);
    expect(r.stdout + r.stderr).not.toContain(PASSWORD);
  });

  it('fails when the secret cannot be read', () => {
    const r = run(['check'], { gcloud: 'exit 1' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('store-password');
  });
});
