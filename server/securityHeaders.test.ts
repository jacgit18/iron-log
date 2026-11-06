import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp, type AppDeps } from './app.ts';
import { contentSecurityPolicy, inlineStyleHashes } from './securityHeaders.ts';

const servers: Server[] = [];
async function start(deps: AppDeps = {}): Promise<string> {
  const s = createApp(deps).listen(0);
  servers.push(s);
  await new Promise(done => s.once('listening', done));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}
afterAll(() => Promise.all(servers.map(s => new Promise<void>(done => s.close(() => done())))));

describe('security headers', () => {
  it('sets the fixed headers on API answers, including errors', async () => {
    const base = await start();
    for (const path of ['/api/health', '/api/nope', '/api/commands/log-session']) {
      const h = (await fetch(`${base}${path}`)).headers;
      expect(h.get('x-content-type-options'), path).toBe('nosniff');
      expect(h.get('x-frame-options'), path).toBe('DENY');
      expect(h.get('referrer-policy'), path).toBe('strict-origin-when-cross-origin');
      expect(h.get('cross-origin-opener-policy'), path).toBe('same-origin');
      expect(h.get('permissions-policy'), path).toContain('camera=(self)');
      expect(h.get('permissions-policy'), path).toContain('microphone=()');
      expect(h.get('cross-origin-resource-policy'), path).toBe('same-origin');
      expect(h.get('cross-origin-embedder-policy'), path).toBeNull();
      expect(h.get('x-powered-by'), path).toBeNull();
    }
  });

  it('allows only the app\'s own scripts, and nobody framing it', async () => {
    const csp = (await fetch(`${await start()}/api/health`)).headers.get('content-security-policy')!;
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self' https://api.github.com");
  });

  it('sends HSTS only over https, which behind a proxy means a trusted X-Forwarded-Proto', async () => {
    const plain = await start();
    expect((await fetch(`${plain}/api/health`)).headers.get('strict-transport-security')).toBeNull();
    // Without trust proxy a client cannot claim https.
    expect((await fetch(`${plain}/api/health`, { headers: { 'x-forwarded-proto': 'https' } })).headers.get('strict-transport-security')).toBeNull();
    const proxied = await start({ trustProxy: 1 });
    expect((await fetch(`${proxied}/api/health`, { headers: { 'x-forwarded-proto': 'https' } })).headers.get('strict-transport-security')).toContain('max-age=31536000');
    expect((await fetch(`${proxied}/api/health`)).headers.get('strict-transport-security')).toBeNull();
  });
});

describe('style sources', () => {
  it('createApp hashes the inline styles of the pages it serves into the policy it sends', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ironlog-csp-app-'));
    try {
      const block = 'body{margin:0}\r\n[hidden]{display:none}';
      writeFileSync(join(dir, 'index.html'), `<!doctype html><style>${block}</style><p>x`);
      const base = await start({ staticDir: dir });
      const csp = (await fetch(`${base}/`)).headers.get('content-security-policy')!;
      const expected = `'sha256-${createHash('sha256').update(block.replace(/\r\n/g, '\n')).digest('base64')}'`;
      expect(csp).toContain(expected); // the hash the browser computes (CRLF read as LF)
      expect(csp).toMatch(/style-src 'self' 'sha256-/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('lets only the hashed inline <style> blocks of the built pages style the page, and keeps style attributes working', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ironlog-csp-'));
    try {
      writeFileSync(join(dir, 'index.html'), '<!doctype html><style>body{margin:0}</style><p>x');
      writeFileSync(join(dir, 'privacy.html'), '<!doctype html><style media="all">h1{color:red}</style><style>body{margin:0}</style>');
      writeFileSync(join(dir, 'app.js'), '<style>ignored{}</style>');
      const hashes = inlineStyleHashes(dir);
      expect(hashes).toHaveLength(2); // the same block twice is one hash
      const csp = contentSecurityPolicy(hashes);
      expect(csp).toMatch(/style-src 'self' 'sha256-[A-Za-z0-9+/=]+' 'sha256-[A-Za-z0-9+/=]+';/);
      expect(csp).not.toMatch(/style-src [^;]*unsafe-inline/);
      expect(csp).toContain("style-src-attr 'unsafe-inline'");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('is a plain self-only policy with no pages to hash', () => {
    expect(inlineStyleHashes(undefined)).toEqual([]);
    expect(contentSecurityPolicy([])).toContain("style-src 'self';");
  });
});
