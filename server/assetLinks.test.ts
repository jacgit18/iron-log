import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { buildAssetLinks } from './assetLinks.ts';

const A = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';
const B = '0F:'.repeat(31) + '0F';
const PKG = 'app.loadbearer.twa';
type Doc = { target: { sha256_cert_fingerprints: string[] } }[];

describe('buildAssetLinks', () => {
  it('builds the handle_all_urls statement', () => {
    expect(buildAssetLinks({ ANDROID_PACKAGE_NAME: PKG, ANDROID_SHA256_CERT_FINGERPRINTS: A })).toEqual([
      { relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: PKG, sha256_cert_fingerprints: [A] } },
    ]);
  });
  it('takes several comma-separated fingerprints, upper-cases them and drops repeats', () => {
    const out = buildAssetLinks({ ANDROID_PACKAGE_NAME: PKG, ANDROID_SHA256_CERT_FINGERPRINTS: ` ${A.toLowerCase()} , ${B},${A}` }) as Doc;
    expect(out[0].target.sha256_cert_fingerprints).toEqual([A, B]);
  });
  it('is null when either value is unset or blank', () => {
    expect(buildAssetLinks({})).toBeNull();
    expect(buildAssetLinks({ ANDROID_PACKAGE_NAME: PKG })).toBeNull();
    expect(buildAssetLinks({ ANDROID_SHA256_CERT_FINGERPRINTS: A })).toBeNull();
    expect(buildAssetLinks({ ANDROID_PACKAGE_NAME: ' ', ANDROID_SHA256_CERT_FINGERPRINTS: ' ' })).toBeNull();
  });
  it('rejects a malformed package name', () => {
    for (const pkg of ['loadbearer', 'app..x', '1app.x', 'app.loadbearer/x', 'app.load bearer', '"><x.y']) expect(buildAssetLinks({ ANDROID_PACKAGE_NAME: pkg, ANDROID_SHA256_CERT_FINGERPRINTS: A }), pkg).toBeNull();
  });
  it('rejects a malformed fingerprint, even when one of several is fine', () => {
    for (const f of ['nope', A.slice(0, -3), A.replaceAll(':', ''), `${A}:00`, A.replace('AA', 'ZZ'), `${A},`, `${A},oops`]) expect(buildAssetLinks({ ANDROID_PACKAGE_NAME: PKG, ANDROID_SHA256_CERT_FINGERPRINTS: f }), f).toBeNull();
  });
});

describe('GET /.well-known/assetlinks.json', () => {
  let server: Server;
  let base: string;
  const keep = { ANDROID_PACKAGE_NAME: process.env.ANDROID_PACKAGE_NAME, ANDROID_SHA256_CERT_FINGERPRINTS: process.env.ANDROID_SHA256_CERT_FINGERPRINTS };
  const url = () => `${base}/.well-known/assetlinks.json`;
  beforeAll(async () => {
    server = createApp({}).listen(0); // no built PWA: the route works without one
    await new Promise(done => server.once('listening', done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    for (const [k, v] of Object.entries(keep)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    await new Promise<void>(done => server.close(() => done()));
  });

  it('is a 404 while the variables are unset', async () => {
    delete process.env.ANDROID_PACKAGE_NAME;
    delete process.env.ANDROID_SHA256_CERT_FINGERPRINTS;
    expect((await fetch(url())).status).toBe(404);
  });
  it('is a 404 for a malformed value', async () => {
    process.env.ANDROID_PACKAGE_NAME = PKG;
    process.env.ANDROID_SHA256_CERT_FINGERPRINTS = 'not-a-fingerprint';
    expect((await fetch(url())).status).toBe(404);
  });
  it('answers JSON built from the variables at request time', async () => {
    process.env.ANDROID_PACKAGE_NAME = PKG;
    process.env.ANDROID_SHA256_CERT_FINGERPRINTS = `${A},${B}`;
    const res = await fetch(url());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual(buildAssetLinks({ ANDROID_PACKAGE_NAME: PKG, ANDROID_SHA256_CERT_FINGERPRINTS: `${A},${B}` }));
    process.env.ANDROID_SHA256_CERT_FINGERPRINTS = B; // changed with no restart
    expect(((await (await fetch(url())).json()) as Doc)[0].target.sha256_cert_fingerprints).toEqual([B]);
  });
  it('does not answer a write', async () => {
    process.env.ANDROID_PACKAGE_NAME = PKG;
    process.env.ANDROID_SHA256_CERT_FINGERPRINTS = A;
    expect((await fetch(url(), { method: 'POST' })).status).toBe(404);
  });
});
