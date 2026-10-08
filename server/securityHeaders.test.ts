import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp, type AppDeps } from './app.ts';

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
      expect(h.get('permissions-policy'), path).toContain('camera=()');
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
