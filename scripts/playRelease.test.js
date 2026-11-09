import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('--code at or below the current version still builds but says Play may reject it', () => {
    const r = run(['build', '--code', '2']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain('not above');
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

// The Play API half: `curl` is replaced by a stub that answers like Google and records every call, so nothing is sent anywhere.
describe('play-release.sh upload, release and tracks', () => {
  const TOKEN = 'play-token-not-real';
  let calls, argv, bodies;

  const curlStub = () => stub('curl', `
cfg="$(cat)"
method=GET; body=""; url=""; args=("$@")
for ((i=0; i<\${#args[@]}; i++)); do case "\${args[$i]}" in -X) method="\${args[$((i+1))]}";; -d) body="\${args[$((i+1))]}";; esac; done
url="\${args[\${#args[@]}-1]}"
echo "$method \${url%%\\?*}" >> "${calls}"
echo "$*" >> "${argv}"
echo "$cfg" >> "${argv}"
[ -n "$body" ] && echo "$method $body" >> "${bodies}"
all=" $* "
reply() { case "$all" in *" -w "*) printf '%s\\n%s' "$1" "\${2:-200}" ;; *) printf '%s' "$1" ;; esac; }
case "$url" in
  *generateAccessToken) reply '{"accessToken":"${TOKEN}"}' ;;
  *bundles*) [ "\${STUB_FAIL:-}" = bundles ] && reply '{"error":{"message":"The caller does not have permission"}}' 403 || reply "{\\"versionCode\\":\${STUB_BUNDLE_CODE:-2}}" ;;
  *:commit) reply '{}' ;;
  */tracks/*) reply '{}' ;;
  */tracks) reply '{"tracks":[{"track":"alpha","releases":[{"status":"completed","versionCodes":["2"]}]},{"track":"production"}]}' ;;
  */edits) [ "$method" = POST ] && reply '{"id":"E1"}' ;;
  */edits/*) reply '{}' ;;
esac`);

  beforeEach(() => {
    calls = join(dir, 'calls'); argv = join(dir, 'argv'); bodies = join(dir, 'bodies');
    for (const f of [calls, argv, bodies]) writeFileSync(f, '');
    writeFileSync(join(android, 'app-release-bundle.aab'), 'bundle');
  });

  const play = (args, env = {}, opts = {}) => run(args, { env: { CURL: curlStub(), PLAY_ACCESS_TOKEN: TOKEN, ...env }, ...opts });
  const callList = () => readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean);

  it('uploads the bundle, sets the track with notes, and commits, in that order', () => {
    const r = play(['upload', '--track', 'alpha', '--notes', 'Fixes the icon.', '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(callList().map(c => c.replace(/^(\w+) .*\/(edits[^?]*)$/, '$1 $2'))).toEqual([
      'POST edits', 'POST edits/E1/bundles', 'PUT edits/E1/tracks/alpha', 'POST edits/E1:commit',
    ]);
    const put = readFileSync(bodies, 'utf8');
    expect(put).toContain('"versionCodes":["2"]');
    expect(put).toContain('"status":"completed"');
    expect(put).toContain('"text":"Fixes the icon."');
    expect(r.stdout).toContain("Sent version 2 to the 'alpha' track");
  });

  it('--draft leaves the release as a draft', () => {
    const r = play(['upload', '--track', 'alpha', '--draft', '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(bodies, 'utf8')).toContain('"status":"draft"');
  });

  it('never puts the token on the command line', () => {
    play(['upload', '--track', 'alpha', '--yes']);
    const seen = readFileSync(argv, 'utf8');
    expect(seen.split('\n').filter(l => l.includes('-sS')).join('\n')).not.toContain(TOKEN);
    expect(seen).toContain(`Bearer ${TOKEN}`); // only on the stdin config line
  });

  it('refuses without a track, without --yes when there is no terminal, and with a missing bundle, and sends nothing', () => {
    expect(play(['upload', '--yes']).stderr).toContain('no track');
    expect(play(['upload', '--track', 'alpha']).stderr).toContain('--yes');
    rmSync(join(android, 'app-release-bundle.aab'));
    expect(play(['upload', '--track', 'alpha', '--yes']).stderr).toContain('run \'build\' first');
    expect(callList()).toEqual([]);
  });

  it('discards the edit and does not commit when the bundle is not the manifest version', () => {
    const r = play(['upload', '--track', 'alpha', '--yes'], { STUB_BUNDLE_CODE: '7' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("versionCode '7'");
    const list = callList();
    expect(list.some(c => c.endsWith(':commit'))).toBe(false);
    expect(list.at(-1)).toMatch(/^DELETE .*\/edits\/E1$/);
  });

  it('shows Google\'s own message when a call is refused, and cleans up', () => {
    const r = play(['upload', '--track', 'alpha', '--yes'], { STUB_FAIL: 'bundles' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('403');
    expect(r.stderr).toContain('The caller does not have permission');
    expect(callList().at(-1)).toMatch(/^DELETE /);
  });

  it('makes its own token from the service account when none is given', () => {
    const r = play(['tracks'], { PLAY_ACCESS_TOKEN: '', PLAY_SERVICE_ACCOUNT: 'releaser@example.iam.gserviceaccount.com' });
    expect(r.status, r.stderr).toBe(0);
    expect(callList()[0]).toContain('serviceAccounts/releaser@example.iam.gserviceaccount.com:generateAccessToken');
    expect(readFileSync(argv, 'utf8')).toContain(`Bearer ${TOKEN}`);
  });

  it('says what to set when there is no way to sign in', () => {
    const r = play(['tracks'], { PLAY_ACCESS_TOKEN: '', PLAY_SERVICE_ACCOUNT: '' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('PLAY_SERVICE_ACCOUNT');
  });

  it('tracks lists track names and their releases without changing anything', () => {
    const r = play(['tracks']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('alpha');
    expect(r.stdout).toContain('completed 2');
    expect(r.stdout).toContain('production');
    expect(callList().some(c => c.startsWith('PUT') || c.endsWith(':commit'))).toBe(false);
  });

  it('release builds a new version, then uploads exactly that version', () => {
    const r = play(['release', '--track', 'alpha', '--code', '5', '--yes'], { STUB_BUNDLE_CODE: '5' });
    expect(r.status, r.stderr).toBe(0);
    expect(manifest()).toContain('"appVersionCode": 5');
    expect(readFileSync(bodies, 'utf8')).toContain('"versionCodes":["5"]');
    expect(r.stdout).toContain("Sent version 5 to the 'alpha' track");
  });

  it('release stops before building when no track is given', () => {
    const r = play(['release', '--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no track');
    expect(manifest()).toBe(MANIFEST);
    expect(() => readFileSync(join(dir, 'log'), 'utf8')).toThrow(); // Bubblewrap never ran
  });
});
